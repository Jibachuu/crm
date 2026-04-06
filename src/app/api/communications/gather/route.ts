import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

interface TimelineItem {
  date: string;
  channel: string;
  direction: string;
  sender: string;
  text: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { company_id } = await req.json();
  if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const admin = createAdminClient();
  const timeline: TimelineItem[] = [];

  // 1. Get company + contacts
  const { data: company } = await admin.from("companies").select("*").eq("id", company_id).single();
  if (!company) return NextResponse.json({ error: "Компания не найдена" }, { status: 404 });

  const { data: contacts } = await admin.from("contacts").select("id, full_name, email, telegram_id, phone").eq("company_id", company_id);
  const contactEmails = (contacts ?? []).map((c) => c.email?.toLowerCase()).filter(Boolean) as string[];
  const contactTgIds = (contacts ?? []).map((c) => c.telegram_id).filter(Boolean) as string[];

  // 2. Communications from DB (notes, logged emails, etc.)
  const { data: comms } = await admin.from("communications")
    .select("channel, direction, body, subject, sender_name, from_address, created_at")
    .eq("entity_type", "company").eq("entity_id", company_id)
    .order("created_at", { ascending: true });

  for (const c of comms ?? []) {
    timeline.push({
      date: c.created_at,
      channel: c.channel,
      direction: c.direction,
      sender: c.sender_name ?? c.from_address ?? "",
      text: [c.subject ? `Тема: ${c.subject}` : "", c.body ?? ""].filter(Boolean).join("\n"),
    });
  }

  // Also get communications linked to contacts
  for (const contact of contacts ?? []) {
    const { data: contactComms } = await admin.from("communications")
      .select("channel, direction, body, subject, sender_name, from_address, created_at")
      .eq("entity_type", "contact").eq("entity_id", contact.id)
      .order("created_at", { ascending: true });
    for (const c of contactComms ?? []) {
      timeline.push({
        date: c.created_at,
        channel: c.channel,
        direction: c.direction,
        sender: c.sender_name ?? c.from_address ?? contact.full_name ?? "",
        text: [c.subject ? `Тема: ${c.subject}` : "", c.body ?? ""].filter(Boolean).join("\n"),
      });
    }
  }

  // 3. Sent emails from sent_emails table
  const { data: sentEmails } = await admin.from("sent_emails")
    .select("to_address, subject, body, sent_at")
    .order("sent_at", { ascending: true });
  for (const se of sentEmails ?? []) {
    if (contactEmails.some((e) => se.to_address?.toLowerCase().includes(e))) {
      timeline.push({
        date: se.sent_at,
        channel: "email",
        direction: "outbound",
        sender: "Мы",
        text: [se.subject ? `Тема: ${se.subject}` : "", se.body ?? ""].filter(Boolean).join("\n"),
      });
    }
  }

  // 4. Emails from IMAP (if configured)
  if (contactEmails.length > 0) {
    const imapHost = process.env.IMAP_HOST || process.env.SMTP_HOST;
    const imapPort = Number(process.env.IMAP_PORT || 993);
    const imapUser = process.env.IMAP_USER || process.env.SMTP_USER;
    const imapPass = process.env.IMAP_PASS || process.env.SMTP_PASS;

    if (imapHost && imapUser && imapPass) {
      let client: ImapFlow | null = null;
      try {
        client = new ImapFlow({ host: imapHost, port: imapPort, secure: true, auth: { user: imapUser, pass: imapPass }, logger: false });
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");
        try {
          const mailbox = client.mailbox as { exists?: number } | false;
          const total = (mailbox && typeof mailbox === "object") ? (mailbox.exists ?? 0) : 0;
          if (total > 0) {
            const startSeq = Math.max(1, total - 200 + 1);
            for await (const msg of client.fetch(`${startSeq}:*`, { uid: true, source: true })) {
              try {
                const parsed = await simpleParser(msg.source as Buffer);
                const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase() ?? "";
                const toEmails = (parsed.to ? (Array.isArray(parsed.to) ? parsed.to.flatMap((t) => t.value.map((v) => v.address?.toLowerCase())) : parsed.to.value.map((v) => v.address?.toLowerCase())) : []) as string[];

                const isFromContact = contactEmails.includes(fromEmail);
                const isToContact = toEmails.some((e) => contactEmails.includes(e ?? ""));

                if (isFromContact || isToContact) {
                  timeline.push({
                    date: parsed.date?.toISOString() ?? new Date().toISOString(),
                    channel: "email",
                    direction: isFromContact ? "inbound" : "outbound",
                    sender: parsed.from?.text ?? fromEmail,
                    text: [parsed.subject ? `Тема: ${parsed.subject}` : "", (parsed.text ?? "").slice(0, 2000)].filter(Boolean).join("\n"),
                  });
                }
              } catch { /* skip */ }
            }
          }
        } finally { lock.release(); }
      } catch { /* IMAP error - skip */ }
      finally { if (client) try { await client.logout(); } catch {} }
    }
  }

  // 5. Telegram messages (if configured and contacts have telegram_id)
  // Note: Telegram MTProto requires active session — skip if not available
  // Messages from Telegram would need the telegram API client which is session-based

  // Deduplicate by date+channel+text hash
  const seen = new Set<string>();
  const deduped = timeline.filter((item) => {
    const key = `${item.date?.slice(0, 16)}_${item.channel}_${(item.text ?? "").slice(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort chronologically
  deduped.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return NextResponse.json({
    company: company.name,
    contacts: (contacts ?? []).map((c) => ({ name: c.full_name, email: c.email, telegram: c.telegram_id, phone: c.phone })),
    timeline: deduped,
    total: deduped.length,
  });
}
