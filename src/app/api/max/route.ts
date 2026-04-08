import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function maxProxy(path: string, options?: RequestInit) {
  const url = process.env.MAX_PROXY_URL;
  const key = process.env.MAX_PROXY_KEY;
  if (!url || !key) throw new Error("MAX_PROXY_URL и MAX_PROXY_KEY не настроены");

  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: { Authorization: key, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  return res.json();
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  try {
    if (action === "status") {
      const data = await maxProxy("/status");
      return NextResponse.json(data);
    }

    if (action === "chats") {
      const data = await maxProxy("/chats");
      return NextResponse.json(data);
    }

    if (action === "messages") {
      const chatId = searchParams.get("chat_id");
      const count = searchParams.get("count") ?? "50";
      if (!chatId) return NextResponse.json({ error: "chat_id required" }, { status: 400 });
      const data = await maxProxy(`/messages?chatId=${chatId}&count=${count}`);
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

  const body = await req.json();
  const { action } = body;

  try {
    if (action === "send") {
      const { chat_id, text, fileId } = body;
      if (!chat_id || (!text && !fileId)) return NextResponse.json({ error: "chat_id and (text or fileId) required" }, { status: 400 });
      const data = await maxProxy("/send", {
        method: "POST",
        body: JSON.stringify({ chatId: chat_id, text: text || "", fileId }),
      });
      return NextResponse.json(data);
    }

    if (action === "upload") {
      const { chat_id, fileName, fileType, fileBase64 } = body;
      if (!chat_id || !fileBase64) return NextResponse.json({ error: "chat_id and fileBase64 required" }, { status: 400 });

      const proxyUrl = process.env.MAX_PROXY_URL;
      const proxyKey = process.env.MAX_PROXY_KEY;
      if (!proxyUrl || !proxyKey) return NextResponse.json({ error: "Proxy not configured" }, { status: 503 });

      // Upload file to MAX via proxy (opcode 87 → fu.oneme.ru → fileId)
      const fileBuffer = Buffer.from(fileBase64, "base64");
      const uploadRes = await fetch(`${proxyUrl}/upload?name=${encodeURIComponent(fileName || "file")}`, {
        method: "POST",
        headers: { Authorization: proxyKey, "Content-Type": fileType || "application/octet-stream" },
        body: new Uint8Array(fileBuffer),
      });
      const uploadData = await uploadRes.json();

      if (uploadData.fileId) {
        // Send message with native file attachment
        const sendRes = await maxProxy("/send", {
          method: "POST",
          body: JSON.stringify({ chatId: chat_id, fileId: uploadData.fileId }),
        });
        return NextResponse.json({ ok: true, ...sendRes });
      }

      return NextResponse.json({ error: "Upload failed", details: uploadData }, { status: 500 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? String(err) }, { status: 500 });
  }
}
