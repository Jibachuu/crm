import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/funnel-stages?funnel_id=X — стадии одной воронки.
// Этап 4 миграции browser→VPS.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const funnelId = searchParams.get("funnel_id");
  if (!funnelId) return NextResponse.json({ error: "funnel_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("funnel_stages")
    .select("*").eq("funnel_id", funnelId).order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ stages: data ?? [] });
}
