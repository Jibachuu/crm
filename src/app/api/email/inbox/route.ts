import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
  const port = Number(process.env.IMAP_PORT || 993);
  const imapUser = process.env.IMAP_USER || process.env.SMTP_USER;
  const imapPass = process.env.IMAP_PASS || process.env.SMTP_PASS;

  if (!host || !imapUser || !imapPass) {
    return NextResponse.json({ error: "IMAP не настроен. Добавьте IMAP_HOST, IMAP_USER, IMAP_PASS (или используются SMTP_*)" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || 30);
  const folder = searchParams.get("folder") || "INBOX";

  let client: ImapFlow | null = null;

  try {
    client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user: imapUser, pass: imapPass },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock(folder);

    try {
      const mailbox = client.mailbox as { exists?: number } | false;
      const total = (mailbox && typeof mailbox === "object") ? (mailbox.exists ?? 0) : 0;

      if (total === 0) {
        return NextResponse.json({ emails: [], total: 0 });
      }

      // Fetch last N messages
      const startSeq = Math.max(1, total - limit + 1);
      const emails: {
        uid: number;
        subject: string;
        from: string;
        fromEmail: string;
        to: string;
        date: string;
        preview: string;
        seen: boolean;
      }[] = [];

      for await (const msg of client.fetch(`${startSeq}:*`, {
        uid: true,
        flags: true,
        envelope: true,
        source: true,
      })) {
        try {
          const parsed = await simpleParser(msg.source as Buffer);
          emails.push({
            uid: msg.uid,
            subject: parsed.subject ?? "(без темы)",
            from: parsed.from?.text ?? "",
            fromEmail: parsed.from?.value?.[0]?.address ?? "",
            to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(", ") : parsed.to.text) : "",
            date: parsed.date?.toISOString() ?? new Date().toISOString(),
            preview: (parsed.text ?? "").slice(0, 200),
            seen: msg.flags?.has("\\Seen") ?? false,
          });
        } catch {
          // Skip unparseable messages
        }
      }

      // Newest first
      emails.reverse();

      return NextResponse.json({ emails, total });
    } finally {
      lock.release();
    }
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? String(err);
    return NextResponse.json({ error: `IMAP: ${msg}` }, { status: 500 });
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
}
