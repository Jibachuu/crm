import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params;
  const supabase = await createClient();

  // Fetch the lead with its products
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*, lead_products(*, products(name, sku))")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Лид не найден" }, { status: 404 });
  }

  if (lead.status === "converted") {
    return NextResponse.json({ error: "Лид уже конвертирован" }, { status: 400 });
  }

  // Pick default DEAL funnel + first stage so converted deal appears in kanban + lists
  const { data: dealFunnel } = await supabase
    .from("funnels")
    .select("id")
    .eq("type", "deal")
    .eq("is_default", true)
    .maybeSingle();

  let funnelId: string | null = dealFunnel?.id ?? null;
  if (!funnelId) {
    // Fallback: any deal funnel
    const { data: anyFunnel } = await supabase
      .from("funnels")
      .select("id")
      .eq("type", "deal")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    funnelId = anyFunnel?.id ?? null;
  }

  let stageId: string | null = null;
  if (funnelId) {
    const { data: firstStage } = await supabase
      .from("funnel_stages")
      .select("id")
      .eq("funnel_id", funnelId)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    stageId = firstStage?.id ?? null;
  }

  // Create deal from lead
  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .insert({
      title: lead.title,
      contact_id: lead.contact_id,
      company_id: lead.company_id,
      source: lead.source,
      assigned_to: lead.assigned_to,
      created_by: lead.created_by,
      stage: "lead",
      funnel_id: funnelId,
      stage_id: stageId,
      description: lead.description,
    })
    .select("id")
    .single();

  if (dealError || !deal) {
    return NextResponse.json({ error: "Не удалось создать сделку: " + dealError?.message }, { status: 500 });
  }

  // Copy lead_products (block=request) to deal_products
  const requestProducts = (lead.lead_products ?? []).filter(
    (lp: { product_block: string }) => lp.product_block !== "order"
  );

  if (requestProducts.length > 0) {
    await supabase.from("deal_products").insert(
      requestProducts.map((lp: {
        product_id: string;
        variant_id: string | null;
        quantity: number;
        unit_price: number;
        discount_percent: number;
        total_price: number;
      }) => ({
        deal_id: deal.id,
        product_id: lp.product_id,
        variant_id: lp.variant_id,
        quantity: lp.quantity,
        unit_price: lp.unit_price,
        discount_percent: lp.discount_percent,
        total_price: lp.total_price,
        product_block: "request",
      }))
    );
  }

  // Mark lead as converted
  await supabase.from("leads").update({ status: "converted" }).eq("id", leadId);

  return NextResponse.json({ dealId: deal.id });
}
