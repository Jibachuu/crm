import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params;
  const supabase = createAdminClient();

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

  // Copy ALL lead_products (both 'request' and 'order' blocks) to deal_products
  const allProducts = lead.lead_products ?? [];
  let productsCopied = 0;
  if (allProducts.length > 0) {
    const { error: prodErr } = await supabase.from("deal_products").insert(
      allProducts.map((lp: {
        product_id: string;
        variant_id: string | null;
        quantity: number;
        unit_price: number;
        discount_percent: number;
        total_price: number;
        product_block: string | null;
      }) => ({
        deal_id: deal.id,
        product_id: lp.product_id,
        variant_id: lp.variant_id,
        quantity: lp.quantity,
        unit_price: lp.unit_price,
        discount_percent: lp.discount_percent,
        total_price: lp.total_price,
        product_block: lp.product_block ?? "request",
      }))
    );
    if (!prodErr) productsCopied = allProducts.length;
  }

  // Copy communications (COPY, not MOVE — keep originals on lead)
  const { data: leadComms } = await supabase
    .from("communications")
    .select("channel, direction, subject, body, from_address, to_address, duration_seconds, recording_url, transcript, external_id, created_by")
    .eq("entity_type", "lead")
    .eq("entity_id", leadId);

  let commsCopied = 0;
  if (leadComms && leadComms.length > 0) {
    const { error: commErr } = await supabase.from("communications").insert(
      leadComms.map((c) => ({ ...c, entity_type: "deal", entity_id: deal.id }))
    );
    if (!commErr) commsCopied = leadComms.length;
  }

  // Copy tasks (COPY, not MOVE)
  const { data: leadTasks } = await supabase
    .from("tasks")
    .select("title, description, status, priority, assigned_to, created_by, due_date, completed_at")
    .eq("entity_type", "lead")
    .eq("entity_id", leadId);

  let tasksCopied = 0;
  if (leadTasks && leadTasks.length > 0) {
    const { error: taskErr } = await supabase.from("tasks").insert(
      leadTasks.map((t) => ({ ...t, entity_type: "deal", entity_id: deal.id }))
    );
    if (!taskErr) tasksCopied = leadTasks.length;
  }

  // Mark lead as converted
  await supabase.from("leads").update({ status: "converted" }).eq("id", leadId);

  return NextResponse.json({
    dealId: deal.id,
    products: productsCopied,
    comments: commsCopied,
    tasks: tasksCopied,
  });
}
