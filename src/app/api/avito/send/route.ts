import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

let cachedToken: { token: string; expires: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 30000) return cachedToken.token;

  const clientId = process.env.AVITO_CLIENT_ID;
  const clientSecret = process.env.AVITO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("AVITO_CLIENT_ID/SECRET не настроены");

  const res = await fetch("https://api.avito.ru/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "Не удалось получить access_token");
  }
  cachedToken = { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { peer_id, text, entity_type, entity_id } = await req.json();
  if (!peer_id || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "peer_id (chat_id) and text required" }, { status: 400 });
  }

  const userId = process.env.AVITO_USER_ID;
  if (!userId) return NextResponse.json({ error: "AVITO_USER_ID не настроен" }, { status: 503 });

  try {
    const token = await getAccessToken();
    const res = await fetch(`https://api.avito.ru/messenger/v1/accounts/${userId}/chats/${peer_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { text }, type: "text" }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data.error?.message ?? "Avito error" }, { status: 502 });
    }

    const admin = createAdminClient();
    await admin.from("inbox_messages").insert({
      channel: "avito",
      chat_id: String(peer_id),
      external_id: data.id ?? null,
      direction: "outbound",
      text,
      sent_at: new Date().toISOString(),
    });

    if (entity_type && entity_id) {
      await admin.from("communications").insert({
        entity_type,
        entity_id,
        channel: "avito",
        direction: "outbound",
        body: text,
        to_address: String(peer_id),
        created_by: user.id,
      });
    }

    return NextResponse.json({ ok: true, messageId: data.id });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
