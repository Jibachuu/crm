import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET для specifications и specification_items. Этап 4 миграции browser→VPS.
//   ?id=<spec_id> + ?items=1 — отдаёт spec + spec_items
//   ?spec_id=X&items_only=1  — только items
//   иначе                     — список (опц. фильтр contract_id)

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const specId = searchParams.get("spec_id");
  const itemsOnly = searchParams.get("items_only") === "1";
  const withItems = searchParams.get("items") === "1";
  const contractId = searchParams.get("contract_id");

  const admin = createAdminClient();

  if (itemsOnly && specId) {
    const { data } = await admin.from("specification_items").select("*").eq("specification_id", specId).order("sort_order");
    return NextResponse.json({ items: data ?? [] });
  }

  if (id) {
    const { data: spec } = await admin.from("specifications").select("*").eq("id", id).single();
    if (!spec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let items = null;
    if (withItems) {
      const { data } = await admin.from("specification_items").select("*").eq("specification_id", id).order("sort_order");
      items = data ?? [];
    }
    return NextResponse.json({ spec, items });
  }

  let q = admin.from("specifications").select("*").order("spec_number");
  if (contractId) q = q.eq("contract_id", contractId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ specifications: data ?? [] });
}
