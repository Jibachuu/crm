import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import ProductionKanban from "./ProductionKanban";

export default async function ProductionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();

  const [{ data: orders }, { data: users }, { data: wonDeals }] = await Promise.all([
    admin.from("order_production")
      .select("*, companies(id, name), contacts(full_name), deals(id, title, deal_products(quantity, products(name, sku))), manager:users!order_production_manager_id_fkey(id, full_name), worker:users!order_production_worker_id_fkey(id, full_name)")
      .order("created_at", { ascending: false }),
    admin.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
    admin.from("deals").select("id, title, companies(name)").eq("stage", "won").order("created_at", { ascending: false }).limit(50),
  ]);

  return (
    <>
      <Header title="Производство" />
      <main className="p-4">
        <ProductionKanban
          initialOrders={orders ?? []}
          users={users ?? []}
          wonDeals={wonDeals ?? []}
          currentUserId={user.id}
          userRole={profile?.role ?? "manager"}
        />
      </main>
    </>
  );
}
