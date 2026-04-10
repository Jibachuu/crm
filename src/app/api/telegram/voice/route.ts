import { NextRequest, NextResponse } from "next/server";

const URL_BASE = process.env.TG_PROXY_URL || "http://72.56.243.123:3300";
const KEY = process.env.TG_PROXY_KEY || "artevo-tg-proxy-2026";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const voice = formData.get("voice") as File | null;
  const peer = formData.get("peer") as string | null;

  if (!voice || !peer) {
    return NextResponse.json({ error: "voice и peer обязательны" }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await voice.arrayBuffer());
    const upstream = await fetch(`${URL_BASE}/upload?peer=${encodeURIComponent(peer)}&kind=voice`, {
      method: "POST",
      headers: { Authorization: KEY, "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    const data = await upstream.json();
    if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
    return NextResponse.json({ status: "sent" });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}
