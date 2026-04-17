import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { peer_id, text, entity_type, entity_id } = await req.json();
  if (!peer_id || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "peer_id (phone) and text required" }, { status: 400 });
  }

  const url = process.env.WA_PROXY_URL;
  const key = process.env.WA_PROXY_KEY;
  if (!url || !key) return NextResponse.json({ error: "WA_PROXY_URL/KEY не настроены" }, { status: 503 });

  try {
    const res = await fetch(`${url}/send`, {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({ phone: peer_id, text }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data.error ?? "WhatsApp error" }, { status: 502 });
    }

    const admin = createAdminClient();
    await admin.from("inbox_messages").insert({
      channel: "whatsapp",
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
        channel: "whatsapp",
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
