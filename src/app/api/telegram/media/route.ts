import { NextRequest, NextResponse } from "next/server";

const URL_BASE = process.env.TG_PROXY_URL || "http://72.56.243.123:3300";
const KEY = process.env.TG_PROXY_KEY || "artevo-tg-proxy-2026";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const peer = searchParams.get("peer");
  const msgId = searchParams.get("msgId");

  if (!peer || !msgId) {
    return NextResponse.json({ error: "peer и msgId обязательны" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${URL_BASE}/media?peer=${encodeURIComponent(peer)}&msgId=${msgId}`, {
      headers: { Authorization: KEY },
    });
    if (!upstream.ok) {
      const errText = await upstream.text();
      return NextResponse.json({ error: errText }, { status: upstream.status });
    }
    const headers: Record<string, string> = {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    };
    const len = upstream.headers.get("content-length");
    if (len) headers["Content-Length"] = len;
    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}
