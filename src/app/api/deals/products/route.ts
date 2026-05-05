import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// /api/deals/products — admin-routed mutations on deal_products.
// Direct supabase.from("deal_products").delete()/update() in the
// browser hits RLS for non-admin users (April-27 sweep memo) and
// silently fails — managers couldn't remove rows from the Запрос /
// Заказ blocks (backlog v5 follow-up reported 2026-05-04).

// GET — same admin-route reasoning. Direct SELECT was returning []
// from manager browsers, so the new "Из заказа сделки" button kept
// reporting "В сделке нет товаров в блоке Заказ" even when there
// were rows (2026-05-05).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("deal_id");
  const block = searchParams.get("block"); // 'order' | 'request' | null = both
  if (!dealId) return NextResponse.json({ error: "deal_id required" }, { status: 400 });

  const admin = createAdminClient();
  let q = admin
    .from("deal_products")
    .select("id, name, quantity, unit_price, total_price, product_id, product_block, variants, products(name, sku, category, subcategory, liters, container)")
    .eq("deal_id", dealId);
  if (block) q = q.eq("product_block", block);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ products: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  if (ids.length === 0) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("deal_products").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, deleted: ids.length });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  // Whitelist editable fields so a malformed body can't write nonsense
  // columns (e.g. created_by, deal_id).
  for (const k of [
    "quantity", "unit_price", "discount_percent", "total_price",
    "lifecycle_days", "variants", "product_block",
  ]) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("deal_products")
    .update(updates).eq("id", body.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ product: data });
}
