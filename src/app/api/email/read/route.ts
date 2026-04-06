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
    return NextResponse.json({ error: "IMAP не настроен" }, { status: 503 });
  }

  const uid = Number(new URL(req.url).searchParams.get("uid"));
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  let client: ImapFlow | null = null;

  try {
    client = new ImapFlow({
      host, port, secure: true,
      auth: { user: imapUser, pass: imapPass },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const rawMsg = await client.fetchOne(String(uid), { source: true, flags: true }, { uid: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = rawMsg as any;
      if (!msg?.source) return NextResponse.json({ error: "Письмо не найдено" }, { status: 404 });

      const parsed = await simpleParser(msg.source as Buffer);

      return NextResponse.json({
        uid,
        subject: parsed.subject ?? "(без темы)",
        from: parsed.from?.text ?? "",
        fromEmail: parsed.from?.value?.[0]?.address ?? "",
        to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(", ") : parsed.to.text) : "",
        date: parsed.date?.toISOString() ?? "",
        html: parsed.html || null,
        text: parsed.text || null,
        attachments: (parsed.attachments ?? []).map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
        })),
      });
    } finally {
      lock.release();
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? String(err) }, { status: 500 });
  } finally {
    if (client) { try { await client.logout(); } catch { /* */ } }
  }
}
