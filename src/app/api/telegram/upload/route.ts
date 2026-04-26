import { NextRequest, NextResponse } from "next/server";

const URL_BASE = process.env.TG_PROXY_URL || "http://72.56.243.123:3300";
const KEY = process.env.TG_PROXY_KEY || "artevo-tg-proxy-2026";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const peer = formData.get("peer") as string | null;
  const caption = (formData.get("caption") as string | null) ?? "";

  if (!file || !peer) {
    return NextResponse.json({ error: "file и peer обязательны" }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    // Clipboard images and some drag-and-drop sources hand us empty
    // file.name → TG proxy sends them as "unnamed" with no extension,
    // recipient can't open. Synthesize a name from the MIME type.
    const ext = (mimeType.split("/")[1] || "bin").replace("jpeg", "jpg").split(";")[0];
    const fileName = file.name?.trim() || `attachment_${Date.now()}.${ext}`;
    // Determine kind: images → photo (inline), everything else → file (as document with filename)
    const isImage = mimeType.startsWith("image/") && !mimeType.includes("svg");
    const kind = isImage ? "photo" : "file";
    const upstream = await fetch(
      `${URL_BASE}/upload?peer=${encodeURIComponent(peer)}&kind=${kind}&caption=${encodeURIComponent(caption)}&filename=${encodeURIComponent(fileName)}`,
      {
        method: "POST",
        headers: { Authorization: KEY, "Content-Type": mimeType, "X-Filename": fileName },
        body: bytes,
      }
    );
    const data = await upstream.json();
    if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
    return NextResponse.json({ status: "sent" });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}
