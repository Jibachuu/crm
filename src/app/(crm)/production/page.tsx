import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import ProductionKanban from "./ProductionKanban";

// Backlog v6 §7.1 — give the page its own browser tab title.
export const metadata: Metadata = { title: "Производство" };

export default async function ProductionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();

  // The previous query used PostgREST FK aliases like
  // `users!order_production_manager_id_fkey` — fragile if the FK name
  // is different on the live DB. Two sequential queries with explicit
  // column embedding (`manager:manager_id(...)`) is what PostgREST
  // recommends and tolerates renamed constraints.
  let orders: unknown[] = [];
  let loadError: string | null = null;
  try {
    const { data, error } = await admin
      .from("order_production")
      .select(`
        *,
        companies(id, name),
        contacts(full_name),
        deals(id, title, deal_products(quantity, product_block, variants, products(name, sku))),
        manager:manager_id(id, full_name),
        worker:worker_id(id, full_name)
      `)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    orders = data ?? [];
  } catch (e) {
    loadError = (e as Error).message ?? String(e);
    console.error("[production] load failed:", loadError);
  }

  // v90 (#41 Жиба 26.06.2026): «была выигранная сделка ИП Семёнов в CRM,
  // не нашлась в производстве». Старый запрос отдавал ТОЛЬКО первые 50
  // сделок где text-поле stage='won'. Две дыры:
  //   1) лимит 50 — старые won-сделки просто не доезжали до dropdown'а;
  //   2) часть сделок хранит «выигранность» через stage_id → funnel_stages
  //      где is_success=true, но text-поле stage не обязательно ровно "won"
  //      (бывает "Выиграна", "win" и т.д.). Раньше такие не показывались.
  // Сначала вычисляем все стейджи с is_success=true в воронках сделок,
  // потом отбираем сделки где stage='won' ИЛИ stage_id IN (success-stages).
  // Также исключаем те у которых УЖЕ есть order_production — нет смысла
  // создавать второй заказ из той же сделки. Лимит подняли до 500.
  const { data: successStages } = await admin
    .from("funnel_stages")
    .select("id, funnels!inner(type)")
    .eq("is_success", true)
    .eq("funnels.type", "deal");
  const successStageIds = (successStages ?? []).map((s: { id: string }) => s.id);

  const { data: existingOrders } = await admin
    .from("order_production")
    .select("deal_id")
    .not("deal_id", "is", null);
  const usedDealIds = new Set((existingOrders ?? []).map((r: { deal_id: string | null }) => r.deal_id).filter(Boolean));

  let wonQuery = admin.from("deals")
    .select("id, title, stage, stage_id, companies(name)")
    .is("deleted_at", null);
  if (successStageIds.length > 0) {
    wonQuery = wonQuery.or(`stage.eq.won,stage_id.in.(${successStageIds.join(",")})`);
  } else {
    wonQuery = wonQuery.eq("stage", "won");
  }
  const [{ data: users }, { data: wonDealsRaw }] = await Promise.all([
    admin.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
    wonQuery.order("created_at", { ascending: false }).limit(500),
  ]);
  const wonDeals = (wonDealsRaw ?? []).filter((d: { id: string }) => !usedDealIds.has(d.id));

  return (
    <>
      <Header title="Производство" />
      <main className="p-4">
        {loadError && (
          <div className="mb-3 p-3 rounded text-sm" style={{ background: "#fff3e0", border: "1px solid #ffb74d", color: "#bf7600" }}>
            Не удалось загрузить заказы производства: <code>{loadError}</code>.
            Проверьте миграцию v23 (таблица <code>order_production</code>) и FK-связи на users.
          </div>
        )}
        <ProductionKanban
          initialOrders={orders}
          users={users ?? []}
          wonDeals={wonDeals ?? []}
          currentUserId={user.id}
          userRole={profile?.role ?? "manager"}
        />
      </main>
    </>
  );
}
