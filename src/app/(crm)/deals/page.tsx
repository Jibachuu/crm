import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, countRows } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import DealsList from "./DealsList";

export const metadata: Metadata = { title: "Сделки" };

const PAGE_LIMIT = 5000;

export default async function DealsPage() {
  const admin = createAdminClient();

  const [deals, users, funnelStages, totalActive] = await Promise.all([
    fetchAll(admin, "deals", `
      *,
      contacts(id, full_name),
      companies(id, name),
      users!deals_assigned_to_fkey(id, full_name)
    `, { order: { column: "created_at", ascending: false }, notDeleted: true, limit: PAGE_LIMIT }),
    fetchAll(admin, "users", "id, full_name", {
      eq: { is_active: true },
      order: { column: "full_name" },
    }),
    fetchAll(admin, "funnel_stages", "id, funnel_id, name, slug, color, sort_order, is_final, is_success", {
      order: { column: "sort_order" },
    }),
    countRows(admin, "deals", { notDeleted: true }),
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
        <DealsList initialDeals={deals} users={users} funnelStages={dealStages} totalActive={totalActive} pageLimit={PAGE_LIMIT} />
      </main>
    </>
  );
}
