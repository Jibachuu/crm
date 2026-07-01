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
    const download = searchParams.get("download") === "1" ? "&download=1" : "";
    const upstream = await fetch(`${URL_BASE}/media?peer=${encodeURIComponent(peer)}&msgId=${msgId}${download}`, {
      headers: { Authorization: KEY },
    });
    if (!upstream.ok) {
      const errText = await upstream.text();
      return NextResponse.json({ error: errText }, { status: upstream.status });
    }
    // Прокидываем Content-Disposition/X-Filename от tg-proxy — тогда
    // браузер сохраняет файл с исходным именем и правильным расширением,
    // и inline-viewer'ы (audio/video/img) видят настоящий mime.
    const headers: Record<string, string> = {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    };
    const len = upstream.headers.get("content-length");
    if (len) headers["Content-Length"] = len;
    const disp = upstream.headers.get("content-disposition");
    if (disp) headers["Content-Disposition"] = disp;
    const xfn = upstream.headers.get("x-filename");
    if (xfn) headers["X-Filename"] = xfn;
    headers["Access-Control-Expose-Headers"] = "Content-Disposition, X-Filename";
    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}
