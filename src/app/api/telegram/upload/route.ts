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
    const upstream = await fetch(
      `${URL_BASE}/upload?peer=${encodeURIComponent(peer)}&kind=file&caption=${encodeURIComponent(caption)}`,
      {
        method: "POST",
        headers: { Authorization: KEY, "Content-Type": "application/octet-stream" },
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
