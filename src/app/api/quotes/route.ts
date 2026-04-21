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
    const { id, company_id, contact_id, deal_id, manager_id, payment_terms, delivery_terms, comment, status, items, hide_total, hide_photos, category_overrides, column_titles, custom_blocks } = body;

    const totalAmount = (items ?? []).reduce((s: number, i: { sum: number }) => s + (i.sum ?? 0), 0);

    const payload = {
      company_id: company_id || null,
      contact_id: contact_id || null,
      deal_id: deal_id || null,
      manager_id: manager_id || user.id,
      payment_terms: payment_terms || null,
      delivery_terms: delivery_terms || null,
      comment: comment || null,
      status: status || "draft",
      total_amount: totalAmount,
      hide_total: hide_total ?? false,
      hide_photos: hide_photos ?? false,
      category_overrides: category_overrides ?? {},
      column_titles: column_titles ?? {},
      custom_blocks: custom_blocks ?? [],
      updated_at: new Date().toISOString(),
    };

    let quoteId = id;

    if (action === "update" && id) {
      await admin.from("quotes").update(payload).eq("id", id);
    } else {
      const { data, error } = await admin.from("quotes").insert(payload).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      quoteId = data.id;
    }

    // Replace items
    await admin.from("quote_items").delete().eq("quote_id", quoteId);
    if (items?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemRows = items.map((i: any, idx: number) => ({
        quote_id: quoteId,
        product_id: i.product_id || null,
        name: i.name,
        article: i.article || null,
        base_price: i.base_price ?? 0,
        client_price: i.client_price ?? 0,
        discount_pct: i.discount_pct ?? 0,
        qty: i.qty ?? 1,
        sum: i.sum ?? 0,
        image_url: i.image_url || null,
        description: i.description || null,
        hide_photo: !!i.hide_photo,
        price_tiers: i.price_tiers?.length ? i.price_tiers : null,
        bottle_variant: i.bottle_variant || null,
        column_index: i.column_index ?? 0,
        variants: i.variants?.length ? i.variants : null,
        sort_order: idx,
      }));
      await admin.from("quote_items").insert(itemRows);
    }

    return NextResponse.json({ id: quoteId });
  }

  if (action === "delete") {
    const { id } = body;
    await admin.from("quotes").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "update_status") {
    const { id, status } = body;
    await admin.from("quotes").update({ status }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
