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
    // Try existing session first
    const existingSession = process.env.TELEGRAM_SESSION ?? "";
    if (existingSession) {
      try {
        const checkClient = new TelegramClient(new StringSession(existingSession), apiId, apiHash, { connectionRetries: 2, timeout: 10 });
        await Promise.race([checkClient.connect(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))]);
        if (await checkClient.isUserAuthorized()) {
          const me = await checkClient.getMe();
          await checkClient.disconnect();
          return NextResponse.json({ status: "already_authorized", user: { firstName: (me as { firstName?: string }).firstName, phone: (me as { phone?: string }).phone } });
        }
        await checkClient.disconnect();
      } catch {
        // Old session invalid — proceed with fresh session
      }
    }

    // Start fresh session for new auth
    const freshSession = new StringSession("");
    const client = new TelegramClient(freshSession, apiId, apiHash, { connectionRetries: 3 });
    await client.connect();
    const sendResult = await client.sendCode({ apiId, apiHash }, phone);
    // Store phoneCodeHash for SignIn
    if (!(client as any)._phoneCodeHash) (client as any)._phoneCodeHash = new Map();
    (client as any)._phoneCodeHash.set(phone, sendResult.phoneCodeHash);
    clients.set(sessionKey, client);
    return NextResponse.json({ status: "code_sent" });
  }

  if (action === "verify_code") {
    const client = clients.get(sessionKey);
    if (!client) return NextResponse.json({ error: "Сессия не найдена, начните заново" }, { status: 400 });

    try {
      // gramJS v2: use client.start() or invoke SignIn directly
      const { Api } = await import("telegram");
      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: phone,
            phoneCodeHash: (client as any)._phoneCodeHash?.get(phone) ?? "",
            phoneCode: code,
          })
        );
      } catch (signErr: any) {
        // If phoneCodeHash not cached, try start() method
        if (signErr.message?.includes("PHONE_CODE_HASH") || signErr.message?.includes("phoneCodeHash")) {
          await client.start({
            phoneNumber: async () => phone,
            phoneCode: async () => code,
            password: async () => password ?? "",
            onError: (err: Error) => { throw err; },
          });
        } else if (signErr.message?.includes("SESSION_PASSWORD_NEEDED")) {
          return NextResponse.json({ status: "need_password" });
        } else {
          throw signErr;
        }
      }

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
