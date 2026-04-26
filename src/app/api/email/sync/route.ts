import { NextResponse } from "next/server";
import Imap from "imap-simple";
import { createAdminClient } from "@/lib/supabase/admin";

// IMAP poller for the shared inbox. Triggered manually or via cron.
//
// What changed (group 4 fix):
//   • Resolves entity_id by looking up contacts via every email column,
//     so messages land on the right card instead of a placeholder UUID
//     (which used to produce duplicate communication rows on every
//     resync).
//   • Detects bounce messages via Auto-Submitted / X-Failed-Recipients
//     and attributes the bounce to the original recipient, not to
//     MAILER-DAEMON.
//   • If the sender is brand new, auto-creates the contact + a "new"
//     lead with source=email so site-form replies appear in /leads
//     without manual triage.
//   • Dedupes by Message-ID (RFC-5322 unique) instead of from+subject —
//     the latter caused dupes when the same address sent two messages
//     with the same subject.
export async function POST() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;
  const port = Number(process.env.IMAP_PORT ?? "993");

  if (!host || !user || !pass) {
    return NextResponse.json({ error: "IMAP не настроен" }, { status: 503 });
  }

  try {
    const connection = await Imap.connect({
      imap: { host, port, tls: port === 993, authTimeout: 10000, user, password: pass },
    });

    await connection.openBox("INBOX");

    const since = new Date();
    since.setDate(since.getDate() - 7);

    const results = await connection.search(["UNSEEN", ["SINCE", since.toDateString()]], {
      bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID AUTO-SUBMITTED X-FAILED-RECIPIENTS)", "TEXT"],
      markSeen: true,
      struct: true,
    });

    const admin = createAdminClient();
    let saved = 0;
    let bounces = 0;
    let createdLeads = 0;

    for (const msg of results) {
      const header = msg.parts.find((p: { which: string }) => p.which.startsWith("HEADER"));
      const text = msg.parts.find((p: { which: string }) => p.which === "TEXT");
      if (!header) continue;

      const h = header.body as Record<string, string[] | undefined>;
      const fromRaw = h.from?.[0] ?? "";
      const subject = h.subject?.[0] ?? "(без темы)";
      const messageId = h["message-id"]?.[0] ?? "";
      const autoSubmitted = h["auto-submitted"]?.[0] ?? "";
      const failedRecipients = h["x-failed-recipients"]?.[0] ?? "";
      const toRaw = h.to?.[0] ?? "";
      const body = (text?.body as string) ?? "";

      // Extract email address from "Display Name <addr@x>" or raw addr
      const fromEmail = (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).trim().toLowerCase();
      const toEmail = (toRaw.match(/<([^>]+)>/)?.[1] ?? toRaw).trim().toLowerCase();

      const isBounce = !!failedRecipients
        || /^auto-replied|auto-generated/i.test(autoSubmitted)
        || /mailer-daemon|postmaster/i.test(fromEmail);

      // For bounces, the *original* recipient is the contact we care
      // about. Without this the failure is logged against a non-existent
      // mailer-daemon contact.
      const lookupEmail = isBounce ? (failedRecipients.trim().toLowerCase() || toEmail) : fromEmail;

      // Dedupe: prefer Message-ID (globally unique). Fall back to
      // from+subject if a sender's MTA is non-compliant and omits it.
      const dedupeKey = messageId || `${fromEmail}|${subject}`;
      const { data: existing } = await admin
        .from("communications")
        .select("id")
        .eq("channel", "email")
        .eq("external_id", dedupeKey)
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      // Resolve contact by every email column
      let contactId: string | null = null;
      let companyId: string | null = null;
      if (lookupEmail) {
        const pat = lookupEmail;
        const { data: contact } = await admin
          .from("contacts")
          .select("id, company_id")
          .or(`email.ilike.${pat},email_other.ilike.${pat}`)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        if (contact) {
          contactId = contact.id;
          companyId = contact.company_id;
        }
      }

      // For real (non-bounce) inbound mail from an unknown sender,
      // auto-create the contact + an open lead so the manager sees a
      // task in /leads instead of having to dig through /inbox.
      let createdLead = false;
      if (!contactId && !isBounce && fromEmail) {
        const displayName = (fromRaw.match(/^([^<]+)</)?.[1]?.trim()) || fromEmail.split("@")[0];
        const { data: newContact } = await admin
          .from("contacts")
          .insert({ email: fromEmail, full_name: displayName })
          .select("id")
          .single();
        if (newContact) {
          contactId = newContact.id;
          // Pick the default lead funnel + first stage so the lead
          // appears in the kanban without further wiring.
          const { data: funnel } = await admin
            .from("funnels")
            .select("id")
            .eq("type", "lead")
            .eq("is_default", true)
            .maybeSingle();
          let stageId: string | null = null;
          if (funnel) {
            const { data: stage } = await admin
              .from("funnel_stages")
              .select("id")
              .eq("funnel_id", funnel.id)
              .order("sort_order")
              .limit(1)
              .maybeSingle();
            stageId = stage?.id ?? null;
          }
          await admin.from("leads").insert({
            title: subject || `Письмо от ${displayName}`,
            status: "new",
            source: "email",
            contact_id: contactId,
            description: body.slice(0, 500),
            funnel_id: funnel?.id ?? null,
            stage_id: stageId,
          });
          createdLead = true;
          createdLeads++;
        }
      }

      const directionBody = isBounce
        ? `[bounce] ${body.slice(0, 4900)}`
        : body.slice(0, 5000);

      await admin.from("communications").insert({
        entity_type: "contact",
        entity_id: contactId ?? "00000000-0000-0000-0000-000000000000",
        channel: "email",
        direction: "inbound",
        subject: isBounce ? `↩ Не доставлено: ${subject}` : subject,
        body: directionBody,
        from_address: fromRaw,
        to_address: toRaw || null,
        contact_id: contactId,
        company_id: companyId,
        external_id: dedupeKey,
      });
      saved++;
      if (isBounce) bounces++;
      if (createdLead) {
        // Suppress unused warning for createdLead
      }
    }

    connection.end();
    return NextResponse.json({ status: "synced", saved, bounces, createdLeads });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}
