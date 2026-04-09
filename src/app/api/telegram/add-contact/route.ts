import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TG_AUTH_URL = process.env.TG_AUTH_URL || "http://72.56.243.123:3200";
const TG_AUTH_KEY = process.env.TG_AUTH_KEY || "artevo-tg-auth-2026";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { phone, firstName, lastName } = await req.json();
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const session = process.env.TELEGRAM_SESSION ?? "";
  if (!session) return NextResponse.json({ error: "Telegram not connected" }, { status: 503 });

  try {
    const res = await fetch(`${TG_AUTH_URL}/add-contact`, {
      method: "POST",
      headers: { Authorization: TG_AUTH_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ phone, firstName, lastName, session }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
