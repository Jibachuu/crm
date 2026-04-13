import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sync chat messages into communications table for timeline
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, channel, entity_type, entity_id } = await req.json();

  if (!messages?.length || !channel || !entity_type || !entity_id) {
    return NextResponse.json({ error: "messages, channel, entity_type, entity_id required" }, { status: 400 });
  }

  let saved = 0;

  for (const msg of messages) {
    const externalId = `${channel}_${msg.id || msg.uid || msg.time || Date.now()}`;

    // Check if already saved
    const { data: existing } = await supabase
      .from("communications")
      .select("id")
      .eq("external_id", externalId)
      .limit(1)
      .single();

    if (existing) continue;

    await supabase.from("communications").insert({
      entity_type,
      entity_id,
      channel,
      direction: msg.isMe || msg.direction === "outbound" ? "outbound" : "inbound",
      body: msg.text || msg.body || msg.preview || "",
      from_address: msg.sender || msg.from || msg.fromEmail || "",
      sender_name: msg.sender || msg.fromName || msg.from || null,
      subject: msg.subject || null,
      external_id: externalId,
      created_by: msg.isMe ? user.id : null,
      created_at: msg.time ? new Date(typeof msg.time === "number" && msg.time < 9999999999 ? msg.time * 1000 : msg.time).toISOString() : new Date().toISOString(),
    });
    saved++;
  }

  return NextResponse.json({ ok: true, saved });
}
