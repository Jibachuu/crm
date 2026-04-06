import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

interface EmailItem {
  uid: number;
  folder: string;
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  date: string;
  preview: string;
  seen: boolean;
  hasAttachments: boolean;
  // For sent_emails from DB
  dbId?: string;
  body?: string;
  dbAttachments?: { filename: string; size: number }[];
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
  const port = Number(process.env.IMAP_PORT || 993);
  const imapUser = process.env.IMAP_USER || process.env.SMTP_USER;
  const imapPass = process.env.IMAP_PASS || process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "";

  if (!host || !imapUser || !imapPass) {
    return NextResponse.json({ error: "IMAP не настроен" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || 30);
  const includeSent = searchParams.get("sent") === "1";

  let client: ImapFlow | null = null;

  try {
    client = new ImapFlow({
      host, port, secure: true,
      auth: { user: imapUser, pass: imapPass },
      logger: false,
    });

    await client.connect();

    const emails: EmailItem[] = [];

    // Fetch from INBOX via IMAP
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox as { exists?: number } | false;
      const total = (mailbox && typeof mailbox === "object") ? (mailbox.exists ?? 0) : 0;
      if (total > 0) {
        const startSeq = Math.max(1, total - limit + 1);
        for await (const msg of client.fetch(`${startSeq}:*`, { uid: true, flags: true, source: true })) {
          try {
            const parsed = await simpleParser(msg.source as Buffer);
            emails.push({
              uid: msg.uid,
              folder: "INBOX",
              subject: parsed.subject ?? "(без темы)",
              from: parsed.from?.text ?? "",
              fromEmail: parsed.from?.value?.[0]?.address ?? "",
              to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(", ") : parsed.to.text) : "",
              date: parsed.date?.toISOString() ?? new Date().toISOString(),
              preview: (parsed.text ?? "").slice(0, 200),
              seen: msg.flags?.has("\\Seen") ?? false,
              hasAttachments: (parsed.attachments?.length ?? 0) > 0,
            });
          } catch { /* skip */ }
        }
      }
    } finally {
      lock.release();
    }

    // Fetch sent emails from Supabase DB
    if (includeSent) {
      const { data: sentEmails } = await supabase
        .from("sent_emails")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(limit);

      for (const se of sentEmails ?? []) {
        const attArr = (se.attachments ?? []) as { filename: string; size: number }[];
        emails.push({
          uid: 0,
          folder: "SENT",
          subject: se.subject,
          from: smtpFrom,
          fromEmail: smtpFrom,
          to: se.to_address,
          date: se.sent_at,
          preview: (se.body ?? "").slice(0, 200),
          seen: true,
          hasAttachments: attArr.length > 0,
          dbId: se.id,
          body: se.body,
          dbAttachments: attArr,
        });
      }
    }

    // Sort by date, newest first
    emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ emails: emails.slice(0, limit * 2), total: emails.length });
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? String(err);
    return NextResponse.json({ error: `IMAP: ${msg}` }, { status: 500 });
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
}
