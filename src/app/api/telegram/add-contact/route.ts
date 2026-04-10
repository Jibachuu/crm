import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tgProxy } from "@/lib/telegram/proxy";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { phone, username } = body;
  if (!phone && !username) return NextResponse.json({ error: "phone or username required" }, { status: 400 });

  try {
    const data = await tgProxy("/add-contact", { method: "POST", body });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
