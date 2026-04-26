import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, countRows } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import LeadsList from "./LeadsList";

export const metadata: Metadata = { title: "Лиды" };

const PAGE_LIMIT = 1000;

export default async function LeadsPage() {
  const admin = createAdminClient();

  const [leads, users, funnelStages, funnels, totalActive] = await Promise.all([
    fetchAll(admin, "leads", `
      *,
      contacts(id, full_name, phone),
      companies(id, name),
      users!leads_assigned_to_fkey(id, full_name)
    `, { order: { column: "created_at", ascending: false }, notDeleted: true, limit: PAGE_LIMIT }),
    fetchAll(admin, "users", "id, full_name", {
      eq: { is_active: true },
      order: { column: "full_name" },
    }),
    fetchAll(admin, "funnel_stages", "id, funnel_id, name, slug, color, sort_order, is_final, is_success", {
      order: { column: "sort_order" },
    }),
    fetchAll(admin, "funnels", "id, name, type, is_default", {
      eq: { type: "lead" },
      order: { column: "is_default", ascending: false },
    }),
    countRows(admin, "leads", { notDeleted: true }),
  ]);

  return (
    <>
      <Header title="Лиды" />
      <main className="p-6">
        <LeadsList
          initialLeads={leads}
          users={users}
          funnelStages={funnelStages as any[]}
          funnels={funnels as any[]}
          totalActive={totalActive}
          pageLimit={PAGE_LIMIT}
        />
      </main>
    </>
  );
}
