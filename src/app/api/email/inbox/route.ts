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

// Mailbox folders the UI can ask for. Many providers expose more —
// this is the basic Gmail/yandex set, mapped to typical IMAP names.
// `ALL` means "INBOX + SENT", which preserves the existing behaviour.
const FOLDER_CANDIDATES: Record<string, string[]> = {
  INBOX: ["INBOX"],
  SENT: ["INBOX.Sent", "Sent", "Отправленные", "Sent Messages", "Sent Items", "[Gmail]/Sent Mail"],
  DRAFTS: ["INBOX.Drafts", "Drafts", "Черновики", "[Gmail]/Drafts"],
  TRASH: ["INBOX.Trash", "Trash", "Удалённые", "Корзина", "[Gmail]/Trash"],
  SPAM: ["INBOX.Spam", "Spam", "Junk", "Спам", "[Gmail]/Spam"],
};

// Resolve a logical folder ("SENT") to the actual IMAP path that
// exists on the server (e.g. "INBOX.Sent" or "Отправленные") — IMAP
// servers vary wildly. Returns null if nothing matches.
async function resolveFolder(client: ImapFlow, folder: string): Promise<string | null> {
  const candidates = FOLDER_CANDIDATES[folder] || [folder];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: any[] = await client.list();
  const paths = list.map((m) => m.path as string);
  for (const cand of candidates) {
    const hit = paths.find((p) => p === cand || p.toLowerCase() === cand.toLowerCase());
    if (hit) return hit;
  }
  // Fall back to substring (e.g. "Drafts" matches "INBOX.Drafts")
  for (const cand of candidates) {
    const hit = paths.find((p) => p.toLowerCase().includes(cand.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

async function fetchFolder(
  client: ImapFlow,
  folder: string,
  limit: number,
  emails: EmailItem[]
) {
  const path = await resolveFolder(client, folder);
  if (!path) return;
  const lock = await client.getMailboxLock(path);
  try {
    const mailbox = client.mailbox as { exists?: number } | false;
    const total = (mailbox && typeof mailbox === "object") ? (mailbox.exists ?? 0) : 0;
    if (total === 0) return;
    const startSeq = Math.max(1, total - limit + 1);
    for await (const msg of client.fetch(`${startSeq}:*`, { uid: true, flags: true, source: true })) {
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
  // New: folder=INBOX|SENT|DRAFTS|TRASH|SPAM|ALL
  const folder = (searchParams.get("folder") || "ALL").toUpperCase();

  let client: ImapFlow | null = null;

  try {
    client = new ImapFlow({
      host, port, secure: true,
      auth: { user: imapUser, pass: imapPass },
      logger: false,
    });

    await client.connect();

    const emails: EmailItem[] = [];

    if (folder === "ALL" || folder === "INBOX") {
      await fetchFolder(client, "INBOX", limit, emails);
    }

    if (folder === "DRAFTS" || folder === "TRASH" || folder === "SPAM" ||
        (folder === "SENT" && !includeSent)) {
      // Pure IMAP fetch — these folders only exist on the server.
      await fetchFolder(client, folder, limit, emails);
    }

    // SENT — combine IMAP folder (if exists) + DB sent_emails (CRM
    // sometimes has things the server doesn't, e.g. when SMTP didn't
    // BCC the sender).
    if ((folder === "ALL" && includeSent) || folder === "SENT") {
      // Try IMAP Sent folder first (free signal if hosting has one)
      try { await fetchFolder(client, "SENT", limit, emails); } catch { /* hosting.reg.ru имеет только INBOX */ }

      const { data: sentEmails } = await supabase
        .from("sent_emails")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(limit);

      for (const se of sentEmails ?? []) {
        const attArr = (se.attachments ?? []) as { filename: string; size: number }[];
        // Skip if same uid+from already in IMAP-side SENT (unlikely but cheap)
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

    return NextResponse.json({ emails: emails.slice(0, limit * 2), total: emails.length, folder });
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? String(err);
    return NextResponse.json({ error: `IMAP: ${msg}` }, { status: 500 });
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
}
