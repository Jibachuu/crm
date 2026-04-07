import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_API = "https://platform-api.max.ru";

function getToken() {
  return process.env.MAX_BOT_TOKEN ?? "";
}

async function maxFetch(path: string, options?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error("MAX_BOT_TOKEN не настроен");
  const res = await fetch(`${MAX_API}${path}`, {
    ...options,
    headers: { Authorization: token, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MAX API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (!getToken()) return NextResponse.json({ error: "MAX_BOT_TOKEN не настроен" }, { status: 503 });

  try {
    // Get bot info
    if (action === "me") {
      const data = await maxFetch("/me");
      return NextResponse.json(data);
    }

    // Get chats list
    if (action === "chats") {
      const data = await maxFetch("/chats");
      return NextResponse.json(data);
    }

    // Get messages from chat
    if (action === "messages") {
      const chatId = searchParams.get("chat_id");
      if (!chatId) return NextResponse.json({ error: "chat_id required" }, { status: 400 });
      const count = searchParams.get("count") ?? "50";
      const from = searchParams.get("from");
      let url = `/messages?chat_id=${chatId}&count=${count}`;
      if (from) url += `&from=${from}`;
      const data = await maxFetch(url);
      return NextResponse.json(data);
    }

    // Get updates (long polling)
    if (action === "updates") {
      const marker = searchParams.get("marker");
      let url = "/updates?timeout=10&types=message_created";
      if (marker) url += `&marker=${marker}`;
      const data = await maxFetch(url);
      return NextResponse.json(data);
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

  if (!getToken()) return NextResponse.json({ error: "MAX_BOT_TOKEN не настроен" }, { status: 503 });

  const body = await req.json();
  const { action } = body;

  try {
    // Send message
    if (action === "send") {
      const { chat_id, text } = body;
      if (!chat_id || !text) return NextResponse.json({ error: "chat_id and text required" }, { status: 400 });
      const data = await maxFetch(`/messages?chat_id=${chat_id}`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      return NextResponse.json(data);
    }

    // Upload file and send
    if (action === "upload") {
      // First upload the file
      const { chat_id, file_url, file_name } = body;
      // Send as link attachment
      const data = await maxFetch(`/messages?chat_id=${chat_id}`, {
        method: "POST",
        body: JSON.stringify({
          text: file_name ? `📎 ${file_name}` : "📎 Файл",
          attachments: [{ type: "file", payload: { url: file_url } }],
        }),
      });
      return NextResponse.json(data);
    }

    // Get chat info
    if (action === "chat_info") {
      const { chat_id } = body;
      const data = await maxFetch(`/chats/${chat_id}`);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? String(err) }, { status: 500 });
  }
}
