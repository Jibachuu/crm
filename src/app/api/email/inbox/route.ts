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
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
  const port = Number(process.env.IMAP_PORT || 993);
  const imapUser = process.env.IMAP_USER || process.env.SMTP_USER;
  const imapPass = process.env.IMAP_PASS || process.env.SMTP_PASS;

  if (!host || !imapUser || !imapPass) {
    return NextResponse.json({ error: "IMAP не настроен" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || 30);
  const folder = searchParams.get("folder") || "INBOX";
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

    // Fetch from primary folder
    await fetchFromFolder(client, folder, limit, emails);

    // Auto-detect and fetch from Sent folder
    if (includeSent) {
      const sentFolder = await findSentFolder(client);
      if (sentFolder) {
        await fetchFromFolder(client, sentFolder, Math.min(limit, 50), emails);
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

/** List all IMAP folders and find the Sent folder by special-use flag or name */
async function findSentFolder(client: ImapFlow): Promise<string | null> {
  try {
    const folders = await client.list();
    // First try special-use \Sent flag
    for (const f of folders) {
      if (f.specialUse === "\\Sent") return f.path;
    }
    // Fallback: match by common name patterns
    const sentNames = ["sent", "отправленные", "sent messages", "sent items", "sent mail"];
    for (const f of folders) {
      const name = f.name.toLowerCase();
      if (sentNames.includes(name)) return f.path;
    }
  } catch { /* ignore */ }
  return null;
}

async function fetchFromFolder(client: ImapFlow, folder: string, limit: number, emails: EmailItem[]) {
  const lock = await client.getMailboxLock(folder);
  try {
    const mailbox = client.mailbox as { exists?: number } | false;
    const total = (mailbox && typeof mailbox === "object") ? (mailbox.exists ?? 0) : 0;
    if (total === 0) return;

    const startSeq = Math.max(1, total - limit + 1);

    for await (const msg of client.fetch(`${startSeq}:*`, {
      uid: true,
      flags: true,
      source: true,
    })) {
      try {
        const parsed = await simpleParser(msg.source as Buffer);
        emails.push({
          uid: msg.uid,
          folder,
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
  } finally {
    lock.release();
  }
}
