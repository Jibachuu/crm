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
  // deal_products has no `name` column — name lives on the joined
  // products row. Including a non-existent column made the whole query
  // 400 with "column deal_products.name does not exist" 2026-05-05.
  async function run(withKind: boolean) {
    const cols = withKind
      ? "id, quantity, unit_price, total_price, product_id, product_block, variants, base_price, category, subcategory, volume_ml, flavor, kind, products(name, sku, category, subcategory, liters, container, excluded_from_invoice)"
      : "id, quantity, unit_price, total_price, product_id, product_block, variants, base_price, category, subcategory, volume_ml, flavor, products(name, sku, category, subcategory, liters, container, excluded_from_invoice)";
    let q = admin.from("deal_products").select(cols).eq("deal_id", dealId);
    if (block) q = q.eq("product_block", block);
    return q;
  }

  // Try with kind; if migration v82 not applied, fall back without it.
  let r = await run(true);
  if (r.error && /column.*kind.*does not exist|42703/i.test(r.error.message || "")) {
    r = await run(false);
  }
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 400 });
  return NextResponse.json({ products: r.data ?? [] });
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
  // columns (e.g. created_by, deal_id). base_price is editable from
  // EditProductModal (backlog v6 §2.1 — leaving it out silently dropped
  // base-price updates, which the modal then re-derived as the price-reset
  // bug after refresh).
  for (const k of [
    "quantity", "unit_price", "base_price", "discount_percent", "total_price",
    "lifecycle_days", "variants", "product_block",
    // backlog v6 §4.6 — kind разделяет товары на «продажа» и «аренда»;
    // ContractsClient автоматом разводит их по Спецификации и Акту.
    "kind",
  ]) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  let r = await admin.from("deal_products")
    .update(updates).eq("id", body.id)
    .select("*, products(name, sku, image_url)").single();
  if (r.error && /column.*kind.*does not exist|42703/i.test(r.error.message || "")) {
    // Pre-v82 schema — drop `kind` and retry so the rest of the update
    // still goes through.
    delete (updates as Record<string, unknown>).kind;
    r = await admin.from("deal_products")
      .update(updates).eq("id", body.id)
      .select("*, products(name, sku, image_url)").single();
  }
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 400 });
  return NextResponse.json({ product: r.data });
}
