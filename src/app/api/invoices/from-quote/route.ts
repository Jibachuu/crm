import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/invoices/from-quote — convert a КП (quote) into an invoice.
// Backlog v5 §1.1.1: managers want a one-click path from quote to invoice
// without re-typing товары / реквизиты.
//
// Body: { quote_id: string }
// Returns: { invoice }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { quote_id } = await req.json();
  if (!quote_id) return NextResponse.json({ error: "quote_id required" }, { status: 400 });

  const admin = createAdminClient();

  // Load quote + items + buyer (company / contact for fallback name).
  const { data: quote, error: qErr } = await admin
    .from("quotes")
    .select("*, companies(id, name, inn, kpp, legal_address), contacts(id, full_name)")
    .eq("id", quote_id)
    .single();
  if (qErr || !quote) return NextResponse.json({ error: qErr?.message || "Quote not found" }, { status: 404 });

  const { data: items } = await admin
    .from("quote_items")
    .select("*")
    .eq("quote_id", quote_id)
    .order("sort_order");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const company = (quote as any).companies;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contact = (quote as any).contacts;
  const buyerName = company?.name || contact?.full_name || "Покупатель";

  // Auto-number — invoice_number is plain int, monotonically increasing.
  const { data: maxRow } = await admin
    .from("invoices")
    .select("invoice_number")
    .order("invoice_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextNum = (((maxRow?.invoice_number as number | undefined) ?? 0) as number) + 1;

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: invoice, error: iErr } = await admin
    .from("invoices")
    .insert({
      invoice_number: nextNum,
      invoice_date: today,
      payment_due: due,
      buyer_company_id: company?.id ?? null,
      buyer_name: buyerName,
      buyer_inn: company?.inn ?? null,
      buyer_kpp: company?.kpp ?? null,
      buyer_address: company?.legal_address ?? null,
      basis: `Коммерческое предложение №${quote.quote_number ?? quote.id.slice(0, 8)} от ${new Date(quote.created_at).toLocaleDateString("ru-RU")}`,
      deal_id: quote.deal_id ?? null,
      total_amount: items?.reduce((s, i) => s + (i.sum ?? 0), 0) ?? 0,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (iErr || !invoice) return NextResponse.json({ error: iErr?.message || "Insert failed" }, { status: 500 });

  // Translate quote_items → invoice_items. Quotes carry "variants" inside
  // each row (multi-option bottles); flatten — one invoice line per
  // variant, otherwise the row itself.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invItems: any[] = [];
  for (const it of items ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variants = (it as any).variants as { label: string; price: number; quantity: number; sum?: number }[] | null;
    if (variants && variants.length > 0) {
      for (const v of variants) {
        invItems.push({
          invoice_id: invoice.id,
          product_id: it.product_id ?? null,
          name: `${it.name} / ${v.label}`,
          quantity: v.quantity || 1,
          unit: "шт",
          price: v.price || 0,
          total: v.sum ?? (v.price || 0) * (v.quantity || 1),
        });
      }
    } else {
      invItems.push({
        invoice_id: invoice.id,
        product_id: it.product_id ?? null,
        name: it.name,
        quantity: it.qty || 1,
        unit: "шт",
        price: it.client_price || 0,
        total: it.sum || (it.client_price || 0) * (it.qty || 1),
      });
    }
  }

  if (invItems.length > 0) {
    const { error: itemsErr } = await admin.from("invoice_items").insert(invItems);
    if (itemsErr) {
      // Roll back the invoice so we don't leave an empty shell behind.
      await admin.from("invoices").delete().eq("id", invoice.id);
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ invoice });
}
