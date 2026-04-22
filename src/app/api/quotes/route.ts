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
    const { id, company_id, contact_id, deal_id, manager_id, payment_terms, delivery_terms, comment, status, items, hide_total, hide_photos, category_overrides, column_titles, custom_blocks, custom_recipient } = body;

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
      custom_recipient: custom_recipient || null,
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

  // Soft delete — move to trash (30 days before permanent deletion)
  if (action === "delete") {
    const { id } = body;
    await admin.from("quotes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  // Restore from trash
  if (action === "restore") {
    const { id } = body;
    await admin.from("quotes").update({ deleted_at: null }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  // Permanently delete from trash
  if (action === "purge") {
    const { id } = body;
    await admin.from("quotes").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  // Auto-purge quotes deleted more than 30 days ago
  if (action === "cleanup_trash") {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await admin.from("quotes").delete().lt("deleted_at", cutoff).select("id");
    return NextResponse.json({ ok: true, purged: data?.length ?? 0 });
  }

  // Duplicate quote
  if (action === "duplicate") {
    const { id } = body;
    const { data: source } = await admin.from("quotes").select("*").eq("id", id).single();
    if (!source) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { id: _, quote_number, created_at, updated_at, deleted_at, ...copy } = source as any;
    void _; void quote_number; void created_at; void updated_at; void deleted_at;
    const { data: newQuote, error } = await admin.from("quotes").insert({ ...copy, status: "draft", comment: source.comment ? `[Копия] ${source.comment}` : "[Копия]" }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Copy items
    const { data: sourceItems } = await admin.from("quote_items").select("*").eq("quote_id", id);
    if (sourceItems?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newItems = sourceItems.map(({ id: _iid, created_at: _cr, ...rest }: any) => ({ ...rest, quote_id: newQuote.id }));
      await admin.from("quote_items").insert(newItems);
    }
    return NextResponse.json({ id: newQuote.id });
  }

  if (action === "update_status") {
    const { id, status } = body;
    await admin.from("quotes").update({ status }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
