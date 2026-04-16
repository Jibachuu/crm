import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import AnalyticsDataSets, { AnalyticsDashboard } from "./AnalyticsClient";
import AnalyticsTabs from "./AnalyticsTabs";
import { formatCurrency } from "@/lib/utils";

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const admin = (await import("@/lib/supabase/admin")).createAdminClient();
  const [leadsResult, dealsResult, companiesResult, wonDealsResult, productsResult, callsResult, coldCallsResult] =
    await Promise.all([
      supabase.from("leads").select("status, source"),
      supabase.from("deals").select("stage, amount, source, company_id"),
      supabase.from("companies").select("id, name"),
      supabase.from("deals").select("company_id, amount").eq("stage", "won"),
      supabase.from("deal_products").select("product_id, quantity, base_price, unit_price, discount_percent, total_price, products(name, sku)"),
      admin.from("communications").select("direction, duration_seconds, body, created_at").eq("channel", "phone"),
      admin.from("cold_calls").select("status, call_reached, converted_lead_id"),
    ]);

  const leads = (leadsResult.data ?? []) as { status: string; source: string | null }[];
  const deals = (dealsResult.data ?? []) as { stage: string; amount: number | null; source: string | null; company_id: string | null }[];
  const companies = (companiesResult.data ?? []) as { id: string; name: string }[];

  const wonDeals = deals.filter((d) => d.stage === "won");
  const totalRevenue = wonDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const avgDeal = wonDeals.length ? totalRevenue / wonDeals.length : 0;
  const conversionRate = leads.length
    ? ((leads.filter((l) => l.status === "converted").length / leads.length) * 100).toFixed(1)
    : 0;

  const kpis = [
    { label: "Всего лидов", value: leads.length, color: "#0067a5" },
    { label: "Конверсия лид→сделка", value: `${conversionRate}%`, color: "#7b1fa2" },
    { label: "Выручка (выигранные)", value: formatCurrency(totalRevenue), color: "#2e7d32" },
    { label: "Средний чек", value: formatCurrency(avgDeal), color: "#e65c00" },
  ];

  const STAGE_COLORS: Record<string, string> = {
    lead: "#888", proposal: "#0067a5", negotiation: "#e65c00", order_assembly: "#7b1fa2", won: "#2e7d32", lost: "#c62828",
  };
  const STAGE_LABELS: Record<string, string> = {
    lead: "Лид", proposal: "Предложение", negotiation: "Переговоры", order_assembly: "Сборка заказа", won: "Выиграна", lost: "Проиграна",
  };
  const stages = ["lead", "proposal", "negotiation", "order_assembly", "won", "lost"].map((key) => {
    const count = deals.filter((d) => d.stage === key).length;
    return { key, label: STAGE_LABELS[key], count, pct: Math.round((count / (deals.length || 1)) * 100), color: STAGE_COLORS[key] };
  });

  const SOURCE_LABELS: Record<string, string> = {
    website: "Сайт", referral: "Рекомендация", cold_call: "Холодный звонок",
    social: "Соцсети", event: "Мероприятие", other: "Другое",
  };
  const sourceMap = new Map<string, { leads: number; revenue: number }>();
  for (const lead of leads) {
    const src = SOURCE_LABELS[lead.source ?? ""] ?? lead.source ?? "Другое";
    const curr = sourceMap.get(src) ?? { leads: 0, revenue: 0 };
    sourceMap.set(src, { ...curr, leads: curr.leads + 1 });
  }
  for (const deal of deals) {
    const src = SOURCE_LABELS[deal.source ?? ""] ?? deal.source ?? "Другое";
    const curr = sourceMap.get(src) ?? { leads: 0, revenue: 0 };
    sourceMap.set(src, { ...curr, revenue: curr.revenue + (deal.amount ?? 0) });
  }
  const sources = Array.from(sourceMap.entries()).sort((a, b) => b[1].leads - a[1].leads);

  const companyRevenueMap = new Map<string, number>();
  for (const d of wonDealsResult.data ?? []) {
    if (!d.company_id) continue;
    companyRevenueMap.set(d.company_id, (companyRevenueMap.get(d.company_id) ?? 0) + (d.amount ?? 0));
  }
  const companyLTV = companies
    .map((c) => ({ ...c, revenue: companyRevenueMap.get(c.id) ?? 0 }))
    .filter((c) => c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const productMap = new Map<string, { name: string; sku: string; qty: number; revenue: number }>();
  for (const dp of productsResult.data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (Array.isArray(dp.products) ? dp.products[0] : dp.products) as { name: string; sku: string } | null;
    if (!p || !dp.product_id) continue;
    const curr = productMap.get(dp.product_id) ?? { name: p.name, sku: p.sku, qty: 0, revenue: 0 };
    productMap.set(dp.product_id, { ...curr, qty: curr.qty + (dp.quantity ?? 0), revenue: curr.revenue + (dp.total_price ?? 0) });
  }
  const topProducts = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Discount analytics
  const discountMap = new Map<string, { name: string; sku: string; basePrices: number[]; salePrices: number[]; discounts: number[] }>();
  for (const dp of productsResult.data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (Array.isArray(dp.products) ? dp.products[0] : dp.products) as { name: string; sku: string } | null;
    if (!p || !dp.product_id) continue;
    const curr = discountMap.get(dp.product_id) ?? { name: p.name, sku: p.sku, basePrices: [], salePrices: [], discounts: [] };
    if (dp.base_price) curr.basePrices.push(dp.base_price);
    curr.salePrices.push(dp.unit_price ?? 0);
    if (dp.discount_percent > 0) curr.discounts.push(dp.discount_percent);
    discountMap.set(dp.product_id, curr);
  }
  const discountAnalytics = Array.from(discountMap.values())
    .filter((d) => d.discounts.length > 0)
    .map((d) => ({
      name: d.name,
      sku: d.sku,
      basePrice: d.basePrices.length > 0 ? d.basePrices[0] : null,
      minSale: Math.min(...d.salePrices),
      maxSale: Math.max(...d.salePrices),
      avgSale: Math.round(d.salePrices.reduce((s, v) => s + v, 0) / d.salePrices.length),
      avgDiscount: Math.round(d.discounts.reduce((s, v) => s + v, 0) / d.discounts.length * 10) / 10,
      maxDiscount: Math.max(...d.discounts),
      count: d.salePrices.length,
    }))
    .sort((a, b) => b.avgDiscount - a.avgDiscount)
    .slice(0, 15);

  // ── Call analytics ──
  const calls = (callsResult.data ?? []) as { direction: string; duration_seconds: number | null; body: string | null; created_at: string }[];
  const inboundCalls = calls.filter((c) => c.direction === "inbound");
  const outboundCalls = calls.filter((c) => c.direction === "outbound");
  const answeredCalls = calls.filter((c) => (c.duration_seconds ?? 0) > 0);
  const avgDuration = answeredCalls.length ? Math.round(answeredCalls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / answeredCalls.length) : 0;

  const coldCalls = (coldCallsResult.data ?? []) as { status: string; call_reached: boolean | null; converted_lead_id: string | null }[];
  const coldCallsTotal = coldCalls.length;
  const coldCallsReached = coldCalls.filter((c) => c.call_reached).length;
  const coldCallsConverted = coldCalls.filter((c) => c.converted_lead_id).length;

  const callStats = {
    totalCalls: calls.length,
    inbound: inboundCalls.length,
    outbound: outboundCalls.length,
    answered: answeredCalls.length,
    missed: calls.length - answeredCalls.length,
    avgDuration,
    coldCallsTotal,
    coldCallsReached,
    coldCallsConverted,
    coldCallsReachedPct: coldCallsTotal ? Math.round((coldCallsReached / coldCallsTotal) * 100) : 0,
    coldCallsConvertedPct: coldCallsTotal ? Math.round((coldCallsConverted / coldCallsTotal) * 100) : 0,
  };

  return (
    <>
      <Header title="Аналитика" />
      <main className="p-5">
        <AnalyticsTabs
          dashboard={<AnalyticsDashboard kpis={kpis} stages={stages} sources={sources} companyLTV={companyLTV} topProducts={topProducts} discountAnalytics={discountAnalytics} callStats={callStats} />}
          datasets={<AnalyticsDataSets />}
        />
      </main>
    </>
  );
}
