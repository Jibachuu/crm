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

  const params = new URL(req.url).searchParams;
  const uid = Number(params.get("uid"));
  const folder = params.get("folder") || "INBOX";
  const index = Number(params.get("index") ?? "0");

  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  let client: ImapFlow | null = null;

  try {
    client = new ImapFlow({
      host, port, secure: true,
      auth: { user: imapUser, pass: imapPass },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock(folder);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawMsg = await client.fetchOne(String(uid), { source: true }, { uid: true }) as any;
      if (!rawMsg?.source) return NextResponse.json({ error: "Письмо не найдено" }, { status: 404 });

      const parsed = await simpleParser(rawMsg.source as Buffer);
      const attachment = parsed.attachments?.[index];

      if (!attachment) return NextResponse.json({ error: "Вложение не найдено" }, { status: 404 });

      return new NextResponse(new Uint8Array(attachment.content), {
        headers: {
          "Content-Type": attachment.contentType || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.filename || "file")}"`,
          "Content-Length": String(attachment.size),
        },
      });
    } finally {
      lock.release();
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  } finally {
    if (client) { try { await client.logout(); } catch { /* */ } }
  }
}
