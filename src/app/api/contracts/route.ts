import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");
  const dealId = searchParams.get("deal_id");
  // Backlog v6 §4.5 + §4.6 — три типа договоров живут в одной таблице
  // contracts с маркером contract_type. UI каждого модуля передаёт свой
  // contract_type, чтобы не видеть чужие записи. Если параметр не задан —
  // отдаём «обычные» supply, чтобы не сломать существующую страницу.
  const contractType = searchParams.get("contract_type") || "supply";

  const admin = createAdminClient();
  let query = admin.from("contracts")
    .select("*, companies:buyer_company_id(id, name), deals(id, title), specifications(id, spec_number, spec_date, total_amount), contract_equipment_items(id, name, quantity, valuation, sort_order)")
    .eq("contract_type", contractType)
    .order("created_at", { ascending: false });

  if (companyId) query = query.eq("buyer_company_id", companyId);
  if (dealId) query = query.eq("deal_id", dealId);

  const { data } = await query.limit(100);
  return NextResponse.json({ contracts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const admin = createAdminClient();

  if (body.action === "create") {
    const contractType: "supply" | "invoice_contract" | "rental" = body.contract_type === "invoice_contract" || body.contract_type === "rental"
      ? body.contract_type
      : "supply";

    // Get next contract number — independent counter per contract_type
    // so счета-договоры и аренды нумеруются с 1 и не «съедают» номера
    // обычных договоров поставки.
    const { data: maxContract } = await admin.from("contracts")
      .select("contract_number")
      .eq("contract_type", contractType)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastNum = maxContract?.[0]?.contract_number ? parseInt(maxContract[0].contract_number) : 0;
    const nextNum = String(isNaN(lastNum) ? 1 : lastNum + 1);

    const { data, error } = await admin.from("contracts").insert({
      contract_type: contractType,
      contract_number: nextNum,
      contract_date: body.contract_date || new Date().toISOString().slice(0, 10),
      valid_until: body.valid_until || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      buyer_company_id: body.buyer_company_id || null,
      buyer_name: body.buyer_name || "",
      buyer_legal_form: body.buyer_legal_form || null,
      buyer_inn: body.buyer_inn || null,
      buyer_kpp: body.buyer_kpp || null,
      buyer_ogrn: body.buyer_ogrn || null,
      buyer_address: body.buyer_address || null,
      buyer_bank_name: body.buyer_bank_name || null,
      buyer_account: body.buyer_account || null,
      buyer_bik: body.buyer_bik || null,
      buyer_corr_account: body.buyer_corr_account || null,
      buyer_director_name: body.buyer_director_name || null,
      buyer_director_title: body.buyer_director_title || "генерального директора",
      buyer_director_basis: body.buyer_director_basis || "Устава",
      buyer_director_basis_full: body.buyer_director_basis_full || null,
      buyer_email: body.buyer_email || null,
      buyer_phone: body.buyer_phone || null,
      buyer_short_name: body.buyer_short_name || null,
      deal_id: body.deal_id || null,
      comment: body.comment || null,
      created_by: user.id,
      // Invoice-contract specific
      prepayment_days: body.prepayment_days ?? null,
      shipment_days_after_payment: body.shipment_days_after_payment ?? null,
      validity_bank_days: body.validity_bank_days ?? null,
      total_amount: body.total_amount ?? null,
      shipping_cost: body.shipping_cost ?? null,
      // Rental specific
      purchase_frequency_terms: body.purchase_frequency_terms || null,
      equipment_location_address: body.equipment_location_address || null,
    }).select("*").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Invoice-contract стоит на ногах одной таблицей товаров — кладём
    // её сразу как «единственную» спецификацию, чтобы переиспользовать
    // existing specification_items машинерию (она же используется в
    // /api/contracts/generate для счёта-договора).
    if (contractType === "invoice_contract" && Array.isArray(body.items) && body.items.length > 0) {
      const items = body.items as Array<{ name: string; quantity: number; price: number; total: number; product_id?: string }>;
      const totalItems = items.reduce((s, i) => s + (Number(i.total) || 0), 0);
      const { data: spec } = await admin.from("specifications").insert({
        contract_id: data.id,
        spec_number: 1,
        spec_date: data.contract_date,
        delivery_method: body.delivery_method || "СДЭК",
        payment_terms: body.payment_terms || `предоплата 100%, ${body.prepayment_days ?? 5} дней`,
        shipment_days: body.shipment_days_after_payment ?? 3,
        total_amount: totalItems,
      }).select("*").single();
      if (spec) {
        await admin.from("specification_items").insert(
          items.map((i, idx) => ({
            specification_id: spec.id,
            product_id: i.product_id || null,
            name: i.name,
            quantity: i.quantity || 1,
            price: i.price || 0,
            total: i.total || 0,
            sort_order: idx,
          }))
        );
      }
    }

    // Договор аренды: товары на покупку идут в Приложение №2 (specifications),
    // оборудование в аренду — в contract_equipment_items (Приложение №3).
    if (contractType === "rental") {
      const purchaseItems = Array.isArray(body.purchase_items) ? body.purchase_items : [];
      const equipmentItems = Array.isArray(body.equipment_items) ? body.equipment_items : [];

      if (purchaseItems.length > 0) {
        const totalP = purchaseItems.reduce((s: number, i: { total: number }) => s + (Number(i.total) || 0), 0);
        const { data: spec } = await admin.from("specifications").insert({
          contract_id: data.id,
          spec_number: 1,
          spec_date: data.contract_date,
          delivery_method: body.delivery_method || "СДЭК",
          payment_terms: body.payment_terms || "50% предоплата + 50% после отгрузки",
          shipment_days: body.shipment_days_after_payment ?? 30,
          total_amount: totalP,
        }).select("*").single();
        if (spec) {
          await admin.from("specification_items").insert(
            purchaseItems.map((i: { name: string; quantity: number; price: number; total: number; product_id?: string }, idx: number) => ({
              specification_id: spec.id,
              product_id: i.product_id || null,
              name: i.name,
              quantity: i.quantity || 1,
              price: i.price || 0,
              total: i.total || 0,
              sort_order: idx,
            }))
          );
        }
      }

      if (equipmentItems.length > 0) {
        await admin.from("contract_equipment_items").insert(
          equipmentItems.map((i: { name: string; quantity: number; valuation: number; product_id?: string }, idx: number) => ({
            contract_id: data.id,
            product_id: i.product_id || null,
            name: i.name,
            quantity: i.quantity || 1,
            valuation: i.valuation || 0,
            sort_order: idx,
          }))
        );
      }
    }

    return NextResponse.json(data);
  }

  if (body.action === "create_spec") {
    const contractId = body.contract_id;
    if (!contractId) return NextResponse.json({ error: "contract_id required" }, { status: 400 });

    // Get next spec number
    const { data: existing } = await admin.from("specifications").select("spec_number").eq("contract_id", contractId).order("spec_number", { ascending: false }).limit(1);
    const nextSpecNum = (existing?.[0]?.spec_number ?? 0) + 1;

    const items = body.items || [];
    const total = items.reduce((s: number, i: { total: number }) => s + (i.total || 0), 0);

    const { data: spec, error: specErr } = await admin.from("specifications").insert({
      contract_id: contractId,
      spec_number: nextSpecNum,
      spec_date: body.spec_date || new Date().toISOString().slice(0, 10),
      delivery_method: body.delivery_method || "СДЭК",
      delivery_terms: body.delivery_terms || null,
      payment_terms: body.payment_terms || "предоплата 100%",
      shipment_days: body.shipment_days || 3,
      invoice_id: body.invoice_id || null,
      total_amount: total,
    }).select("*").single();

    if (specErr) return NextResponse.json({ error: specErr.message }, { status: 500 });

    // Insert items
    if (items.length > 0 && spec) {
      await admin.from("specification_items").insert(
        items.map((i: { name: string; quantity: number; price: number; total: number; product_id?: string }, idx: number) => ({
          specification_id: spec.id,
          product_id: i.product_id || null,
          name: i.name,
          quantity: i.quantity || 1,
          price: i.price || 0,
          total: i.total || 0,
          sort_order: idx,
        }))
      );
    }

    return NextResponse.json(spec);
  }

  if (body.action === "update") {
    const { id, action: _action, ...fields } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { data, error } = await admin.from("contracts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.action === "delete") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await admin.from("contracts").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
