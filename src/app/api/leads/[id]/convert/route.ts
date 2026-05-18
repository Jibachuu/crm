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

  // Copy lead_products → deal_products, сохраняя блок (Запрос/Заказ).
  // Жиба 18.05: «при конвертации лида копировать товары и из заказа,
  // а не только из запроса». Раньше order-блок терялся, менеджер
  // перебивал руками. Позиции с product_id=NULL (например, доставка
  // из Tilda-блоба) пропускаем — у deal_products колонка NOT NULL.
  type LeadProduct = {
    product_id: string | null;
    variant_id: string | null;
    quantity: number;
    unit_price: number;
    discount_percent: number;
    total_price: number;
    product_block: string;
  };
  const allProducts: LeadProduct[] = (lead.lead_products ?? []).filter((lp: LeadProduct) => !!lp.product_id);

  if (allProducts.length > 0) {
    await supabase.from("deal_products").insert(
      allProducts.map((lp) => ({
        deal_id: deal.id,
        product_id: lp.product_id as string,
        variant_id: lp.variant_id,
        quantity: lp.quantity,
        unit_price: lp.unit_price,
        discount_percent: lp.discount_percent,
        total_price: lp.total_price,
        // Нормализуем блок: всё что не «order» — считаем «request».
        product_block: lp.product_block === "order" ? "order" : "request",
      }))
    );
  }

  // Привязать коммуникации/заметки лида к сделке. Жиба 18.05:
  // «не работает копирование заметок из коммуникации автоматическое
  // при создании сделки из лида». Не дублируем строки — ставим
  // deal_id у существующих lead-коммуникаций. Таймлайн CommunicationsTimeline
  // ищет по `deal_id.eq.X OR (entity_type='deal' AND entity_id=X)`,
  // поэтому достаточно проставить FK, чтобы они отрисовались в
  // таймлайне сделки. На лиде они остаются видны через entity_type/
  // entity_id и lead_id.
  await supabase.from("communications")
    .update({ deal_id: deal.id })
    .eq("lead_id", leadId)
    .is("deal_id", null);
  // Подстраховка: старые записи могут не иметь lead_id (до миграции
  // v77 backfill), но иметь legacy entity_type/entity_id.
  await supabase.from("communications")
    .update({ deal_id: deal.id })
    .eq("entity_type", "lead")
    .eq("entity_id", leadId)
    .is("deal_id", null);

  // Mark lead as converted
  await supabase.from("leads").update({ status: "converted" }).eq("id", leadId);

  return NextResponse.json({ dealId: deal.id });
}
