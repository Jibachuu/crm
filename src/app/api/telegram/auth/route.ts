import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TG_AUTH_URL = process.env.TG_AUTH_URL || "http://72.56.243.123:3200";
const TG_AUTH_KEY = process.env.TG_AUTH_KEY || "artevo-tg-auth-2026";

async function proxyToVps(path: string, body?: unknown) {
  const res = await fetch(`${TG_AUTH_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: TG_AUTH_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, phone, code, password } = await req.json();

  if (action === "start") {
    // Check if already authorized via existing session
    const existingSession = process.env.TELEGRAM_SESSION ?? "";
    if (existingSession) {
      return NextResponse.json({ status: "already_authorized", session: existingSession });
    }

    const data = await proxyToVps("/send-code", { phone });
    return NextResponse.json(data);
  }

  if (action === "verify_code") {
    const data = await proxyToVps("/verify-code", { code, password });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET() {
  const data = await proxyToVps("/status");
  return NextResponse.json(data);
}
