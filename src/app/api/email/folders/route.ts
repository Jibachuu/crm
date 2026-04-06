import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ImapFlow } from "imapflow";

export async function GET() {
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

  let client: ImapFlow | null = null;
  try {
    client = new ImapFlow({ host, port, secure: true, auth: { user: imapUser, pass: imapPass }, logger: false });
    await client.connect();
    const folders = await client.list();
    return NextResponse.json(folders.map((f) => ({ path: f.path, name: f.name, specialUse: f.specialUse, flags: [...(f.flags ?? [])] })));
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  } finally {
    if (client) { try { await client.logout(); } catch {} }
  }
}
