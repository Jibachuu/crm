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
        deals(id, title, deal_products(quantity, product_block, products(name, sku))),
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

  const [{ data: users }, { data: wonDeals }] = await Promise.all([
    admin.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
    admin.from("deals")
      .select("id, title, companies(name)")
      .eq("stage", "won")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

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
