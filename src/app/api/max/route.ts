import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

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

    if (action === "refresh") {
      const data = await maxProxy("/refresh");
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

    if (action === "download") {
      const fileId = searchParams.get("file_id");
      const chatId = searchParams.get("chat_id") || "0";
      const messageId = searchParams.get("message_id") || "0";
      if (!fileId) return NextResponse.json({ error: "file_id required" }, { status: 400 });

      const proxyUrl = process.env.MAX_PROXY_URL;
      const proxyKey = process.env.MAX_PROXY_KEY;
      if (!proxyUrl || !proxyKey) return NextResponse.json({ error: "Proxy not configured" }, { status: 503 });

      // Get signed download URL from MAX via opcode 88
      const urlRes = await fetch(`${proxyUrl}/download-url?fileId=${fileId}&chatId=${chatId}&messageId=${messageId}`, {
        headers: { Authorization: proxyKey },
      });
      const urlData = await urlRes.json();

      if (urlData.url) {
        // Redirect browser to signed MAX download URL
        return NextResponse.redirect(urlData.url, 302);
      }

      // Fallback: proxy the file through VPS
      const dlRes = await fetch(`${proxyUrl}/download?fileId=${fileId}&chatId=${chatId}&messageId=${messageId}`, {
        headers: { Authorization: proxyKey },
      });

      if (!dlRes.ok) {
        const errData = await dlRes.json().catch(() => ({ error: "Download failed" }));
        return NextResponse.json(errData, { status: dlRes.status });
      }

      const contentType = dlRes.headers.get("content-type") || "application/octet-stream";
      const contentDisposition = dlRes.headers.get("content-disposition") || "";
      const contentLength = dlRes.headers.get("content-length") || "";

      const headers: Record<string, string> = { "Content-Type": contentType };
      if (contentDisposition) headers["Content-Disposition"] = contentDisposition;
      if (contentLength) headers["Content-Length"] = contentLength;

      return new NextResponse(dlRes.body, { status: 200, headers });
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
    if (action === "mark_read") {
      const { chat_id } = body;
      if (!chat_id) return NextResponse.json({ error: "chat_id required" }, { status: 400 });
      const data = await maxProxy("/mark-read", { method: "POST", body: JSON.stringify({ chatId: chat_id }) });
      return NextResponse.json(data);
    }

    if (action === "mark_unread") {
      const { chat_id } = body;
      if (!chat_id) return NextResponse.json({ error: "chat_id required" }, { status: 400 });
      const data = await maxProxy("/mark-unread", { method: "POST", body: JSON.stringify({ chatId: chat_id }) });
      return NextResponse.json(data);
    }

    if (action === "add_contact") {
      const { phone, firstName, lastName } = body;
      if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });
      const data = await maxProxy("/add-contact", {
        method: "POST",
        body: JSON.stringify({ phone, firstName, lastName }),
      });
      return NextResponse.json(data);
    }

    if (action === "send") {
      const { chat_id, text, fileId } = body;
      if (!chat_id || (!text && !fileId)) return NextResponse.json({ error: "chat_id and (text or fileId) required" }, { status: 400 });
      const data = await maxProxy("/send", {
        method: "POST",
        body: JSON.stringify({ chatId: chat_id, text: text || "", fileId }),
      });
      return NextResponse.json(data);
    }

    // Edit a message you sent. MAX proxy opcode 67 (verified via probe).
    if (action === "edit_message") {
      const { chat_id, message_id, text } = body;
      if (!chat_id || !message_id || !text) {
        return NextResponse.json({ error: "chat_id, message_id, text required" }, { status: 400 });
      }
      const data = await maxProxy("/edit", {
        method: "POST",
        body: JSON.stringify({ chatId: chat_id, messageId: message_id, text }),
      });
      return NextResponse.json(data);
    }

    // Delete a message. forMe=true deletes only on caller's side; false
    // deletes for everyone (within MAX's 24-hour window).
    if (action === "delete_message") {
      const { chat_id, message_id, for_me } = body;
      if (!chat_id || !message_id) {
        return NextResponse.json({ error: "chat_id, message_id required" }, { status: 400 });
      }
      const data = await maxProxy("/delete", {
        method: "POST",
        body: JSON.stringify({ chatId: chat_id, messageId: message_id, forMe: !!for_me }),
      });
      return NextResponse.json(data);
    }

    if (action === "upload") {
      const { chat_id, fileName, fileType, fileBase64 } = body;
      if (!chat_id || !fileBase64) return NextResponse.json({ error: "chat_id and fileBase64 required" }, { status: 400 });

      const proxyUrl = process.env.MAX_PROXY_URL;
      const proxyKey = process.env.MAX_PROXY_KEY;
      if (!proxyUrl || !proxyKey) return NextResponse.json({ error: "Proxy not configured" }, { status: 503 });

      // Backlog v6 §5.5 — клиенты получали файлы «в неверном формате».
      // Корень — пустые/мусорные fileName и fileType, особенно для
      // скриншотов из clipboard (file.name = "" у Chrome) и для голосовых
      // (file.type иногда пуст). MAX-прокси отдавал контент с
      // application/octet-stream и расширения у клиента не было → файл
      // открывался как бинарь, фото не превьюилось.
      //
      // Синтезируем MIME из расширения и расширение из MIME, чтобы оба
      // были корректны, плюс прокидываем kind=photo для изображений.
      const EXT_TO_MIME: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
        webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", heic: "image/heic",
        mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
        mp3: "audio/mpeg", ogg: "audio/ogg", oga: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4",
        pdf: "application/pdf", doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        txt: "text/plain", csv: "text/csv", zip: "application/zip", rar: "application/vnd.rar",
      };
      function extFromMime(mime: string): string {
        const sub = (mime.split(";")[0] || "").split("/")[1] || "";
        if (!sub) return "bin";
        if (sub === "jpeg") return "jpg";
        if (sub === "quicktime") return "mov";
        if (sub === "svg+xml") return "svg";
        if (sub.startsWith("vnd.openxmlformats-officedocument.wordprocessingml")) return "docx";
        if (sub.startsWith("vnd.openxmlformats-officedocument.spreadsheetml")) return "xlsx";
        if (sub === "vnd.ms-excel") return "xls";
        if (sub === "msword") return "doc";
        return sub;
      }
      const rawName = (fileName || "").trim();
      const rawType = (fileType || "").trim();
      const nameExt = (rawName.split(".").pop() || "").toLowerCase();
      const guessedMimeFromExt = EXT_TO_MIME[nameExt] || "";
      const safeMime = rawType || guessedMimeFromExt || "application/octet-stream";
      const ext = nameExt || extFromMime(safeMime);
      const safeName = rawName || `attachment_${Date.now()}.${ext}`;
      const isImage = safeMime.startsWith("image/") && safeMime !== "image/svg+xml";
      const kind = isImage ? "photo" : (safeMime.startsWith("audio/") ? "voice" : "file");

      // Upload file to MAX via proxy (opcode 87 → fu.oneme.ru → fileId)
      const fileBuffer = Buffer.from(fileBase64, "base64");
      const uploadRes = await fetch(`${proxyUrl}/upload?name=${encodeURIComponent(safeName)}&kind=${kind}`, {
        method: "POST",
        headers: { Authorization: proxyKey, "Content-Type": safeMime, "X-Filename": safeName },
        body: new Uint8Array(fileBuffer),
        signal: AbortSignal.timeout(25000),
      }).catch((e) => {
        console.error("[MAX Upload] Fetch error:", e);
        return null;
      });
      if (!uploadRes) return NextResponse.json({ error: "Upload timeout - try again" }, { status: 504 });
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
