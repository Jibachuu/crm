import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { peer_id, text, entity_type, entity_id } = await req.json();
  if (!peer_id || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "peer_id and text required" }, { status: 400 });
  }

  const token = process.env.VK_GROUP_TOKEN;
  if (!token) return NextResponse.json({ error: "VK_GROUP_TOKEN не настроен" }, { status: 503 });

  const params = new URLSearchParams({
    access_token: token,
    v: "5.199",
    peer_id: String(peer_id),
    message: text,
    random_id: String(Date.now()),
  });

  try {
    const vkRes = await fetch(`https://api.vk.com/method/messages.send?${params.toString()}`);
    const data = await vkRes.json();
    if (data.error) {
      return NextResponse.json({ error: data.error.error_msg ?? "VK error" }, { status: 502 });
    }

    const admin = createAdminClient();
    await admin.from("inbox_messages").insert({
      channel: "vk",
      chat_id: String(peer_id),
      external_id: data.response ? String(data.response) : null,
      direction: "outbound",
      text,
      sent_at: new Date().toISOString(),
    });

    if (entity_type && entity_id) {
      await admin.from("communications").insert({
        entity_type,
        entity_id,
        channel: "vk",
        direction: "outbound",
        body: text,
        to_address: String(peer_id),
        created_by: user.id,
      });
    }

    return NextResponse.json({ ok: true, messageId: data.response });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
