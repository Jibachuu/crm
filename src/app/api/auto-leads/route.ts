import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Dynamic imports for IMAP (may not work in all serverless environments)
async function getImapModules() {
  try {
    const { ImapFlow } = await import("imapflow");
    const { simpleParser } = await import("mailparser");
    return { ImapFlow, simpleParser };
  } catch {
    return null;
  }
}

// Auto-create leads from new messages (Telegram, MAX, Email)
// Called by cron or manually

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({ source: "all" }));
  const { source } = body;
  const admin = createAdminClient();
  const results: string[] = [];

  // Get all existing contacts by telegram_id, maks_id, email
  const { data: existingContacts } = await admin.from("contacts").select("id, telegram_id, maks_id, email, phone, full_name");
  const telegramIds = new Set((existingContacts ?? []).filter((c) => c.telegram_id).map((c) => c.telegram_id));
  const maksIds = new Set((existingContacts ?? []).filter((c) => c.maks_id).map((c) => c.maks_id));

  // ── TELEGRAM: check for new dialogs not in contacts ──
  if (source === "all" || source === "telegram") {
    try {
      const telegramProxy = process.env.TELEGRAM_PROXY_URL;
      if (telegramProxy) {
        const res = await fetch(`${telegramProxy}/dialogs`).catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          const dialogs = data.dialogs ?? [];

          for (const dialog of dialogs) {
            const peerId = String(dialog.id ?? dialog.peerId ?? "");
            const name = dialog.name ?? dialog.title ?? peerId;
            if (!peerId || telegramIds.has(peerId)) continue;

            // Check if lead already exists for this telegram contact
            const { data: existingLead } = await admin.from("leads")
              .select("id")
              .eq("source", "telegram")
              .ilike("title", `%${peerId}%`)
              .limit(1)
              .single();
            if (existingLead) continue;

            // Create contact
            const { data: contact } = await admin.from("contacts")
              .insert({
                full_name: name,
                telegram_id: peerId,
                created_by: (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id,
              })
              .select("id")
              .single();

            if (contact) {
              // Get default funnel
              const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
              const { data: firstStage } = funnel
                ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single()
                : { data: null };

              // Create lead
              await admin.from("leads").insert({
                title: `Telegram: ${name}`,
                source: "telegram",
                status: "new",
                contact_id: contact.id,
                funnel_id: funnel?.id ?? null,
                stage_id: firstStage?.id ?? null,
                created_by: (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id,
              });
              results.push(`Lead created: Telegram ${name}`);
              telegramIds.add(peerId);
            }
          }
        }
      }
    } catch (e) {
      results.push(`Telegram error: ${e}`);
    }
  }

  // ── MAX: check for new chats not in contacts ──
  if (source === "all" || source === "max") {
    try {
      const maxProxy = process.env.MAX_PROXY_URL;
      const maxKey = process.env.MAX_PROXY_KEY;
      if (maxProxy && maxKey) {
        const res = await fetch(`${maxProxy}/chats`, { headers: { Authorization: maxKey } }).catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          const chats = data.chats ?? [];

          for (const chat of chats) {
            const chatId = String(chat.chatId ?? "");
            const name = chat.title ?? chatId;
            if (!chatId || maksIds.has(chatId) || Number(chatId) < 0) continue; // Skip group chats (negative IDs)

            // Check if lead exists
            const { data: existingLead } = await admin.from("leads")
              .select("id")
              .eq("source", "maks")
              .ilike("title", `%${chatId}%`)
              .limit(1)
              .single();
            if (existingLead) continue;

            // Create contact
            const { data: contact } = await admin.from("contacts")
              .insert({
                full_name: name,
                maks_id: chatId,
                created_by: (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id,
              })
              .select("id")
              .single();

            if (contact) {
              const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
              const { data: firstStage } = funnel
                ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single()
                : { data: null };

              await admin.from("leads").insert({
                title: `МАКС: ${name}`,
                source: "maks",
                status: "new",
                contact_id: contact.id,
                funnel_id: funnel?.id ?? null,
                stage_id: firstStage?.id ?? null,
                created_by: (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id,
              });
              results.push(`Lead created: MAX ${name}`);
              maksIds.add(chatId);
            }
          }
        }
      }
    } catch (e) {
      results.push(`MAX error: ${e}`);
    }
  }

  // ── EMAIL: check INBOX for new senders not in contacts ──
  if (source === "all" || source === "email") {
    const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
    const imapUser = process.env.IMAP_USER || process.env.SMTP_USER;
    const imapPass = process.env.IMAP_PASS || process.env.SMTP_PASS;
    const port = Number(process.env.IMAP_PORT || 993);
    const imap = await getImapModules();

    if (host && imapUser && imapPass && imap) {
      let client: InstanceType<typeof imap.ImapFlow> | null = null;
      try {
        const emailSet = new Set((existingContacts ?? []).filter((c) => c.email).map((c) => c.email!.toLowerCase()));

        client = new imap.ImapFlow({
          host, port, secure: true,
          auth: { user: imapUser, pass: imapPass },
          logger: false,
        });
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");

        try {
          const mailbox = client.mailbox as { exists?: number } | false;
          const total = (mailbox && typeof mailbox === "object") ? (mailbox.exists ?? 0) : 0;
          if (total > 0) {
            // Check last 20 emails
            const startSeq = Math.max(1, total - 20 + 1);
            for await (const msg of client.fetch(`${startSeq}:*`, { uid: true, source: true })) {
              try {
                const parsed = await imap.simpleParser(msg.source as Buffer);
                const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase();
                const fromName = parsed.from?.value?.[0]?.name ?? parsed.from?.text ?? fromEmail ?? "";

                if (!fromEmail || fromEmail === imapUser.toLowerCase()) continue;
                if (emailSet.has(fromEmail)) continue;

                // Check if lead already exists for this email
                const { data: existingLead } = await admin.from("leads")
                  .select("id")
                  .eq("source", "email")
                  .ilike("title", `%${fromEmail}%`)
                  .limit(1)
                  .single();
                if (existingLead) { emailSet.add(fromEmail); continue; }

                // Also check contacts table directly
                const { data: existingContact } = await admin.from("contacts")
                  .select("id")
                  .ilike("email", fromEmail)
                  .limit(1)
                  .single();
                if (existingContact) { emailSet.add(fromEmail); continue; }

                const adminId = (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id;

                // Create contact
                const { data: contact } = await admin.from("contacts")
                  .insert({ full_name: fromName || fromEmail, email: fromEmail, created_by: adminId })
                  .select("id")
                  .single();

                if (contact) {
                  const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
                  const { data: firstStage } = funnel
                    ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single()
                    : { data: null };

                  await admin.from("leads").insert({
                    title: `Email: ${fromName || fromEmail}`,
                    source: "email",
                    status: "new",
                    contact_id: contact.id,
                    funnel_id: funnel?.id ?? null,
                    stage_id: firstStage?.id ?? null,
                    created_by: adminId,
                  });
                  results.push(`Lead created: Email ${fromName} <${fromEmail}>`);
                  emailSet.add(fromEmail);
                }
              } catch { /* skip individual email */ }
            }
          }
        } finally {
          lock.release();
        }
        await client.logout();
      } catch (e) {
        results.push(`Email error: ${e}`);
        if (client) try { await client.logout(); } catch { /* */ }
      }
    }
  }

  return NextResponse.json({ ok: true, results, created: results.filter((r) => r.startsWith("Lead")).length });
}

// GET for cron trigger or manual browser call — MAX only (IMAP too slow for serverless)
export async function GET() {
  const admin = createAdminClient();
  const results: string[] = [];

  try {
    const { data: existingContacts } = await admin.from("contacts").select("id, maks_id");
    const maksIds = new Set((existingContacts ?? []).filter((c) => c.maks_id).map((c) => c.maks_id));

    const maxProxy = process.env.MAX_PROXY_URL;
    const maxKey = process.env.MAX_PROXY_KEY;
    if (maxProxy && maxKey) {
      const res = await fetch(`${maxProxy}/chats`, { headers: { Authorization: maxKey } });
      if (res.ok) {
        const data = await res.json();
        for (const chat of data.chats ?? []) {
          const chatId = String(chat.chatId ?? "");
          const name = chat.title ?? chatId;
          if (!chatId || maksIds.has(chatId) || Number(chatId) < 0) continue;

          const { data: existing } = await admin.from("contacts").select("id").eq("maks_id", chatId).limit(1).single();
          if (existing) continue;

          const adminId = (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id;
          const { data: contact } = await admin.from("contacts").insert({ full_name: name, maks_id: chatId, created_by: adminId }).select("id").single();
          if (contact) {
            const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
            const { data: firstStage } = funnel ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single() : { data: null };
            await admin.from("leads").insert({ title: `МАКС: ${name}`, source: "maks", status: "new", contact_id: contact.id, funnel_id: funnel?.id ?? null, stage_id: firstStage?.id ?? null, created_by: adminId });
            results.push(`Lead: MAX ${name}`);
          }
        }
      }
    } else {
      results.push("MAX_PROXY_URL not configured");
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, results, created: results.filter((r) => r.startsWith("Lead")).length });
}
