import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import DealsList from "./DealsList";

export default async function DealsPage() {
  const admin = createAdminClient();

  const [deals, users, funnelStages] = await Promise.all([
    fetchAll(admin, "deals", `
      *,
      contacts(id, full_name),
      companies(id, name),
      users!deals_assigned_to_fkey(id, full_name)
    `, { order: { column: "created_at", ascending: false } }),
    fetchAll(admin, "users", "id, full_name", {
      eq: { is_active: true },
      order: { column: "full_name" },
    }),
    fetchAll(admin, "funnel_stages", "id, funnel_id, name, slug, color, sort_order, is_final, is_success", {
      order: { column: "sort_order" },
    }),
  ]);

  // Get deal funnel stages
  const { data: dealFunnel } = await admin.from("funnels").select("id").eq("type", "deal").eq("is_default", true).single();
  const dealStages = dealFunnel
    ? (funnelStages as any[]).filter((s: any) => s.funnel_id === dealFunnel.id)
    : [];

  return (
    <>
      <Header title="Сделки" />
      <main className="p-6">
        <DealsList initialDeals={deals} users={users} funnelStages={dealStages} />
      </main>
    </>
  );
}
