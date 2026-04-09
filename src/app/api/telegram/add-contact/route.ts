import { NextRequest, NextResponse } from "next/server";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { phone, firstName, lastName } = await req.json();
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH ?? "";
  const session = process.env.TELEGRAM_SESSION ?? "";

  if (!apiId || !apiHash || !session) {
    return NextResponse.json({ error: "Telegram not configured" }, { status: 503 });
  }

  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 2 });

  try {
    await client.connect();

    // Import contact by phone
    const result = await client.invoke(
      new Api.contacts.ImportContacts({
        contacts: [
          new Api.InputPhoneContact({
            clientId: BigInt(Date.now()) as unknown as import("big-integer").BigInteger,
            phone: phone.replace(/\D/g, ""),
            firstName: firstName || phone,
            lastName: lastName || "",
          }),
        ],
      })
    );

    const imported = result.imported?.length ?? 0;
    const users = result.users ?? [];
    const foundUser = users[0] as any;

    await client.disconnect();

    if (imported > 0 || users.length > 0) {
      return NextResponse.json({
        ok: true,
        user: foundUser ? {
          id: String(foundUser.id),
          firstName: foundUser.firstName,
          lastName: foundUser.lastName,
          username: foundUser.username,
          phone: foundUser.phone,
        } : null,
      });
    }

    return NextResponse.json({ ok: false, error: "Контакт не найден в Telegram" });
  } catch (e) {
    try { await client.disconnect(); } catch {}
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
