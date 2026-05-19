import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/funnels?type=lead|deal&with_stages=1 — список воронок (+ опц. стадий).
// Этап 4 миграции browser→VPS (19.05.2026).

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // 'lead' | 'deal'
  const withStages = searchParams.get("with_stages") === "1";

  const admin = createAdminClient();
  let q = admin.from("funnels").select("*").order("is_default", { ascending: false }).order("name");
  if (type) q = q.eq("type", type);
  const { data: funnels, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (withStages && funnels?.length) {
    const ids = funnels.map((f) => f.id);
    const { data: stages } = await admin.from("funnel_stages").select("*").in("funnel_id", ids).order("sort_order");
    return NextResponse.json({ funnels, stages: stages ?? [] });
  }
  return NextResponse.json({ funnels: funnels ?? [], stages: [] });
}
