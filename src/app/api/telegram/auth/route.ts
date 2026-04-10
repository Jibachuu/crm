import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tgProxy } from "@/lib/telegram/proxy";

export async function GET() {
  try {
    const data = await tgProxy<{ ok: boolean; connected: boolean; error?: string }>("/status");
    return NextResponse.json({
      status: data.connected ? "connected" : "disconnected",
      error: data.error ?? null,
    });
  } catch (e) {
    return NextResponse.json({ status: "disconnected", error: String(e) }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Auth flow now happens via local `node get-session.mjs` script and is set
  // as TELEGRAM_SESSION env var on the VPS telegram-proxy. This endpoint just
  // reports current connection status.
  return NextResponse.json({
    status: "manual",
    message: "Используйте `node get-session.mjs` локально и обновите TELEGRAM_SESSION на VPS telegram-proxy",
  });
}
