import { NextRequest, NextResponse } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from "@/lib/supabase/server";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH ?? "";

export async function POST(req: NextRequest) {
  const { to, message, entityType, entityId } = await req.json();

  const sessionStr = process.env.TELEGRAM_SESSION;
  if (!sessionStr || !apiId || !apiHash) {
    return NextResponse.json({ error: "Telegram не настроен" }, { status: 503 });
  }

  try {
    const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, { connectionRetries: 3 });
    await client.connect();
    await client.sendMessage(to, { message });
    await client.disconnect();

    // Log to communications
    if (entityType && entityId) {
      const supabase = await createClient();
      await supabase.from("communications").insert({
        entity_type: entityType,
        entity_id: entityId,
        channel: "telegram",
        direction: "outbound",
        body: message,
        to_address: to,
      });
    }

    return NextResponse.json({ status: "sent" });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}
