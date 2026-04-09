import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import LeadsList from "./LeadsList";

export default async function LeadsPage() {
  const supabase = await createClient();

  const [leads, users, funnelStages, funnels] = await Promise.all([
    fetchAll(supabase, "leads", `
      *,
      contacts(id, full_name, phone),
      companies(id, name),
      users!leads_assigned_to_fkey(id, full_name)
    `, { order: { column: "created_at", ascending: false } }),
    fetchAll(supabase, "users", "id, full_name", {
      eq: { is_active: true },
      order: { column: "full_name" },
    }),
    fetchAll(supabase, "funnel_stages", "id, funnel_id, name, slug, color, sort_order, is_final, is_success", {
      order: { column: "sort_order" },
    }),
    fetchAll(supabase, "funnels", "id, name, type, is_default", {
      eq: { type: "lead" },
      order: { column: "is_default", ascending: false },
    }),
  ]);

  return (
    <>
      <Header title="Лиды" />
      <main className="p-6">
        <LeadsList initialLeads={leads} users={users} funnelStages={funnelStages as any[]} funnels={funnels as any[]} />
      </main>
    </>
  );
}
