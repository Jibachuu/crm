import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  const admin = createAdminClient();

  if (action === "create" || action === "update") {
    const { id, upd_date, invoice_id, buyer_company_id, buyer_name, buyer_inn, buyer_kpp, buyer_address, basis, status, status_code, vat_included, comment, items } = body;

    const totalAmount = (items ?? []).reduce((s: number, i: { total: number }) => s + (i.total ?? 0), 0);

    const payload = {
      upd_date: upd_date || new Date().toISOString().slice(0, 10),
      invoice_id: invoice_id || null,
      buyer_company_id: buyer_company_id || null,
      buyer_name: buyer_name || null,
      buyer_inn: buyer_inn || null,
      buyer_kpp: buyer_kpp || null,
      buyer_address: buyer_address || null,
      basis: basis || "Основной договор",
      status: status || "draft",
      // 1 = СФ + передаточный акт, 2 = только передаточный акт.
      status_code: status_code === 1 ? 1 : 2,
      vat_included: vat_included ?? false,
      comment: comment || null,
      total_amount: totalAmount,
    };

    let updId = id;

    if (action === "update" && id) {
      await admin.from("upd").update(payload).eq("id", id);
    } else {
      const { data, error } = await admin.from("upd").insert({ ...payload, created_by: user.id }).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      updId = data.id;
    }

    // Replace items
    await admin.from("upd_items").delete().eq("upd_id", updId);
    if (items?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemRows = items.map((i: any, idx: number) => ({
        upd_id: updId,
        product_id: i.product_id || null,
        name: i.name,
        quantity: i.quantity ?? 1,
        unit: i.unit || "шт",
        price: i.price ?? 0,
        total: i.total ?? 0,
        sort_order: idx,
      }));
      await admin.from("upd_items").insert(itemRows);
    }

    return NextResponse.json({ id: updId });
  }

  if (action === "delete") {
    const { id } = body;
    await admin.from("upd_items").delete().eq("upd_id", id);
    await admin.from("upd").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
