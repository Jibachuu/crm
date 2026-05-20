import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// /api/invoices — GET (list), POST (create with items), PUT (update + replace items),
// DELETE. Этап 2 миграции browser→VPS (19.05.2026). Раньше InvoicesClient
// дёргал supabase.from("invoices"|"invoice_items") напрямую — Supabase на AWS
// блочится российскими ISP без VPN.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const withItems = searchParams.get("items") === "1";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "1000"), 1), 5000);

  const admin = createAdminClient();

  if (id) {
    const { data: invoice } = await admin
      .from("invoices")
      .select("*, companies:buyer_company_id(id, name, inn, kpp, legal_address)")
      .eq("id", id).single();
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let items = null;
    if (withItems) {
      const { data } = await admin.from("invoice_items").select("*").eq("invoice_id", id).order("id");
      items = data ?? [];
    }
    return NextResponse.json({ invoice, items });
  }

  const { data, error } = await admin
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ invoices: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const admin = createAdminClient();

  // Atomic invoice_number через PG-функцию next_invoice_number() (см.
  // migration_v83). Раньше POST читал max()+1 — гонка двух одновременных
  // запросов писала ОДИН И ТОТ ЖЕ номер. Жиба 20.05: «в списке два #35
  // рядом, клик по номеру открывает другой счёт». nextval() атомарен.
  // Fallback: если миграция v83 ещё не накатили, используем legacy
  // max+1 — UI выживает, но без гарантии уникальности.
  let nextNum: number | string;
  if (body.invoice_number) {
    nextNum = body.invoice_number;
  } else {
    const rpc = await admin.rpc("next_invoice_number");
    if (!rpc.error && rpc.data != null) {
      nextNum = rpc.data as number;
    } else {
      const { data: maxInv } = await admin.from("invoices")
        .select("invoice_number").order("invoice_number", { ascending: false }).limit(1);
      const lastNum = maxInv?.[0]?.invoice_number ? Number(maxInv[0].invoice_number) : 0;
      nextNum = Number.isFinite(lastNum) ? lastNum + 1 : 1;
    }
  }

  const items: Array<{ name: string; quantity: number; price: number; total: number; product_id?: string; unit?: string }> = Array.isArray(body.items) ? body.items : [];
  const totalAmount = body.total_amount ?? items.reduce((s, i) => s + (Number(i.total) || 0), 0);

  // ВАЖНО: схема invoices содержит только базовые поля (migration_v16).
  // Bank/director/ogrn/email/phone живут на contracts, НЕ на invoices.
  // 19.05.2026 incident: первая версия POST падала «Could not find the
  // 'buyer_account' column of 'invoices' in the schema cache».
  const insert: Record<string, unknown> = {
    invoice_number: nextNum,
    invoice_date: body.invoice_date || new Date().toISOString().slice(0, 10),
    payment_due: body.payment_due || null,
    buyer_company_id: body.buyer_company_id || null,
    buyer_name: body.buyer_name || null,
    buyer_inn: body.buyer_inn || null,
    buyer_kpp: body.buyer_kpp || null,
    buyer_address: body.buyer_address || null,
    basis: body.basis || "Основной договор",
    status: body.status || "issued",
    total_amount: totalAmount,
    vat_included: body.vat_included ?? false,
    hide_total: body.hide_total ?? false,
    comment: body.comment || null,
    deal_id: body.deal_id || null,
    created_by: user.id,
  };

  const { data: invoice, error } = await admin.from("invoices").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (items.length > 0) {
    await admin.from("invoice_items").insert(
      items.map((i) => ({
        invoice_id: invoice.id,
        product_id: i.product_id || null,
        name: i.name,
        quantity: i.quantity || 1,
        unit: i.unit || "шт",
        price: i.price || 0,
        total: i.total || 0,
        price_tiers: (i as { price_tiers?: unknown[] }).price_tiers?.length ? (i as { price_tiers?: unknown[] }).price_tiers : null,
        bottle_variant: (i as { bottle_variant?: string }).bottle_variant || null,
      }))
    );
  }

  return NextResponse.json(invoice);
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  // Whitelist строго по реальной схеме invoices (см. migration_v16).
  const updates: Record<string, unknown> = {};
  for (const f of [
    "invoice_number", "invoice_date", "payment_due",
    "buyer_company_id", "buyer_name", "buyer_inn", "buyer_kpp", "buyer_address",
    "basis", "status", "total_amount", "vat_included", "hide_total",
    "comment", "deal_id",
  ]) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from("invoices").update(updates).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Replace items если переданы.
  if (Array.isArray(body.items)) {
    await admin.from("invoice_items").delete().eq("invoice_id", body.id);
    if (body.items.length > 0) {
      await admin.from("invoice_items").insert(
        body.items.map((i: { name: string; quantity: number; price: number; total: number; product_id?: string; unit?: string; price_tiers?: unknown[]; bottle_variant?: string }) => ({
          invoice_id: body.id,
          product_id: i.product_id || null,
          name: i.name,
          quantity: i.quantity || 1,
          unit: i.unit || "шт",
          price: i.price || 0,
          total: i.total || 0,
          price_tiers: i.price_tiers?.length ? i.price_tiers : null,
          bottle_variant: i.bottle_variant || null,
        }))
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("invoice_items").delete().eq("invoice_id", id);
  await admin.from("invoices").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
