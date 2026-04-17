import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("chat_id");
  const limit = Math.min(Number(searchParams.get("limit") ?? "100"), 200);

  if (!chatId) {
    const { data, error } = await supabase
      .from("inbox_messages")
      .select("chat_id, text, sent_at, direction, sender_name, contact_id")
      .eq("channel", "whatsapp")
      .order("sent_at", { ascending: false })
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const seen = new Map<string, { chat_id: string; lastMessage: string; lastDate: string; contact_id: string | null }>();
    for (const m of data ?? []) {
      if (!seen.has(m.chat_id)) {
        seen.set(m.chat_id, { chat_id: m.chat_id, lastMessage: m.text ?? "", lastDate: m.sent_at, contact_id: m.contact_id });
      }
    }
    return NextResponse.json({ chats: Array.from(seen.values()) });
  }

  const { data, error } = await supabase
    .from("inbox_messages")
    .select("id, external_id, direction, text, sender_name, sent_at, attachments")
    .eq("channel", "whatsapp")
    .eq("chat_id", chatId)
    .order("sent_at", { ascending: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}
