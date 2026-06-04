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
    // products(...).flavor / products(...).kind — каталожный аромат/вид;
    // нужен в /invoices при копировании заказа в счёт, чтобы у косметики
    // в строке счёта отображался конкретный аромат, а не только имя.
    const cols = withKind
      ? "id, quantity, unit_price, total_price, product_id, product_block, variants, base_price, category, subcategory, volume_ml, flavor, kind, products(name, sku, category, subcategory, liters, container, flavor, kind, excluded_from_invoice)"
      : "id, quantity, unit_price, total_price, product_id, product_block, variants, base_price, category, subcategory, volume_ml, flavor, products(name, sku, category, subcategory, liters, container, flavor, kind, excluded_from_invoice)";
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

// POST — копировать существующие строки сделки в блок «Заказ».
// Раньше «Перенести в заказ» делал PATCH product_block: request → order,
// и Запрос становился пустым — Жиба 04.06.2026 «информация о запросе тоже
// ценная, я различаю исходную потребность и что покупают». Теперь это
// именно копия: исходные строки в Запросе остаются, в Заказе появляются
// дубликаты с product_block="order".
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const ids: string[] = Array.isArray(body.copy_ids) ? body.copy_ids : [];
  if (ids.length === 0) return NextResponse.json({ error: "copy_ids required" }, { status: 400 });
  const targetBlock = body.target_block === "request" ? "request" : "order";

  const admin = createAdminClient();
  // Все колонки которые имеет смысл копировать. id/created_at БД заполнит сама.
  const colsWithKind = "deal_id, product_id, variant_id, quantity, unit_price, base_price, discount_percent, total_price, variants, category, subcategory, volume_ml, flavor, kind, lifecycle_days";
  const colsNoKind = "deal_id, product_id, variant_id, quantity, unit_price, base_price, discount_percent, total_price, variants, category, subcategory, volume_ml, flavor, lifecycle_days";
  let readData: Record<string, unknown>[] | null = null;
  let readErr: { message?: string } | null = null;
  {
    const r = await admin.from("deal_products").select(colsWithKind).in("id", ids);
    if (r.error && /column.*kind.*does not exist|42703/i.test(r.error.message || "")) {
      const fallback = await admin.from("deal_products").select(colsNoKind).in("id", ids);
      readData = (fallback.data as unknown as Record<string, unknown>[] | null) ?? null;
      readErr = fallback.error;
    } else {
      readData = (r.data as unknown as Record<string, unknown>[] | null) ?? null;
      readErr = r.error;
    }
  }
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 400 });
  if (!readData || readData.length === 0) {
    return NextResponse.json({ error: "no rows found for given ids" }, { status: 404 });
  }

  const rowsToInsert = readData.map((r) => ({ ...r, product_block: targetBlock }));
  const insSelect = "*, products(name, sku, image_url, liters, container)";
  let insData: unknown[] | null = null;
  let insErr: { message?: string } | null = null;
  {
    const r = await admin.from("deal_products").insert(rowsToInsert).select(insSelect);
    if (r.error && /column.*kind.*does not exist|42703/i.test(r.error.message || "")) {
      const rowsNoKind = rowsToInsert.map((row) => {
        const copy: Record<string, unknown> = { ...row };
        delete copy.kind;
        return copy;
      });
      const fallback = await admin.from("deal_products").insert(rowsNoKind).select(insSelect);
      insData = (fallback.data as unknown as unknown[] | null) ?? null;
      insErr = fallback.error;
    } else {
      insData = (r.data as unknown as unknown[] | null) ?? null;
      insErr = r.error;
    }
  }
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
  return NextResponse.json({ products: insData ?? [] });
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
    .select("*, products(name, sku, image_url, liters, container)").single();
  if (r.error && /column.*kind.*does not exist|42703/i.test(r.error.message || "")) {
    // Pre-v82 schema — drop `kind` and retry so the rest of the update
    // still goes through.
    delete (updates as Record<string, unknown>).kind;
    r = await admin.from("deal_products")
      .update(updates).eq("id", body.id)
      .select("*, products(name, sku, image_url, liters, container)").single();
  }
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 400 });
  return NextResponse.json({ product: r.data });
}
