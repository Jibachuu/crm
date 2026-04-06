import { NextRequest, NextResponse } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH ?? "";

// In-memory client store (per-process, resets on restart)
// For production use Redis or DB session storage
const clients = new Map<string, TelegramClient>();

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, phone, code, password, sessionKey = "default" } = body;

  if (!apiId || !apiHash) {
    return NextResponse.json({ error: "TELEGRAM_API_ID и TELEGRAM_API_HASH не настроены" }, { status: 503 });
  }

  if (action === "start") {
    const session = new StringSession(process.env.TELEGRAM_SESSION ?? "");
    const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 });
    await client.connect();

    if (await client.isUserAuthorized()) {
      const me = await client.getMe();
      return NextResponse.json({ status: "already_authorized", user: { firstName: (me as { firstName?: string }).firstName, phone: (me as { phone?: string }).phone } });
    }

    await client.sendCode({ apiId, apiHash }, phone);
    clients.set(sessionKey, client);
    return NextResponse.json({ status: "code_sent" });
  }

  if (action === "verify_code") {
    const client = clients.get(sessionKey);
    if (!client) return NextResponse.json({ error: "Сессия не найдена, начните заново" }, { status: 400 });

    try {
      await (client as unknown as { signIn: (auth: unknown, opts: unknown) => Promise<void> }).signIn({ apiId, apiHash }, { phoneNumber: phone, phoneCode: async () => code, password: async () => password ?? "" });
      const sessionStr = (client.session as StringSession).save();
      const me = await client.getMe();
      clients.delete(sessionKey);
      return NextResponse.json({ status: "authorized", session: sessionStr, user: { firstName: (me as { firstName?: string }).firstName } });
    } catch (err: unknown) {
      const e = err as { message?: string };
      if (e.message?.includes("SESSION_PASSWORD_NEEDED")) {
        return NextResponse.json({ status: "need_password" });
      }
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Неизвестный action" }, { status: 400 });
}
