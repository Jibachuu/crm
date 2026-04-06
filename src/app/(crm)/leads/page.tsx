import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import LeadsList from "./LeadsList";

export default async function LeadsPage() {
  const supabase = await createClient();

  const [leads, users] = await Promise.all([
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
  ]);

  return (
    <>
      <Header title="Лиды" />
      <main className="p-6">
        <LeadsList initialLeads={leads} users={users} />
      </main>
    </>
  );
}
