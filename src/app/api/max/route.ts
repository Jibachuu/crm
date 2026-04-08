import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { connectWithToken, getChats, sendMaxMessage, getMessageHistory, isConnected } from "@/lib/max-client";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.MAX_SESSION_TOKEN;
  if (!token) return NextResponse.json({ error: "MAX_SESSION_TOKEN не настроен" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  try {
    if (!isConnected()) await connectWithToken(token);

    if (action === "status") {
      return NextResponse.json({ connected: isConnected(), hasToken: !!token });
    }

    if (action === "chats") {
      const chats = await getChats();
      return NextResponse.json({ chats });
    }

    if (action === "messages") {
      const chatId = Number(searchParams.get("chat_id"));
      if (!chatId) return NextResponse.json({ error: "chat_id required" }, { status: 400 });
      const count = Number(searchParams.get("count") ?? "50");
      const messages = await getMessageHistory(chatId, count);
      return NextResponse.json({ messages });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.MAX_SESSION_TOKEN;
  if (!token) return NextResponse.json({ error: "MAX_SESSION_TOKEN не настроен" }, { status: 503 });

  const body = await req.json();
  const { action } = body;

  try {
    if (!isConnected()) await connectWithToken(token);

    if (action === "send") {
      const { chat_id, text } = body;
      if (!chat_id || !text) return NextResponse.json({ error: "chat_id and text required" }, { status: 400 });
      const result = await sendMaxMessage(Number(chat_id), text);
      return NextResponse.json({ ok: true, messageId: result.id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? String(err) }, { status: 500 });
  }
}
