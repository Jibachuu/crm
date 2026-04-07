import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import MyClientsGrid from "./MyClientsGrid";

export default async function MyClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  const isManager = profile?.role === "manager";
  const admin = createAdminClient();

  // Get companies (filtered by assigned_to for managers)
  let companiesQuery = admin.from("companies").select("id, name, company_type, city, region, timezone, contract_status, assigned_to, users!companies_assigned_to_fkey(full_name)");
  if (isManager) companiesQuery = companiesQuery.eq("assigned_to", user.id);

  const [{ data: companies }, { data: deals }, { data: tasks }, { data: users }] = await Promise.all([
    companiesQuery.order("name"),
    admin.from("deals").select("company_id, stage, amount, created_at").eq("stage", "won"),
    admin.from("tasks").select("entity_type, entity_id, status").eq("status", "pending"),
    admin.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  // Compute LTV and last activity per company
  const ltvMap = new Map<string, number>();
  const lastDealMap = new Map<string, string>();
  for (const d of deals ?? []) {
    if (!d.company_id) continue;
    ltvMap.set(d.company_id, (ltvMap.get(d.company_id) ?? 0) + (d.amount ?? 0));
    const curr = lastDealMap.get(d.company_id);
    if (!curr || d.created_at > curr) lastDealMap.set(d.company_id, d.created_at);
  }

  // Tasks per company
  const taskMap = new Map<string, number>();
  for (const t of tasks ?? []) {
    if (t.entity_type === "company") taskMap.set(t.entity_id, (taskMap.get(t.entity_id) ?? 0) + 1);
  }

  const enriched = (companies ?? []).map((c) => ({
    ...c,
    ltv: ltvMap.get(c.id) ?? 0,
    lastActivity: lastDealMap.get(c.id) ?? null,
    activeTasks: taskMap.get(c.id) ?? 0,
  }));

  return (
    <>
      <Header title="Мои клиенты" />
      <main className="p-6">
        <MyClientsGrid companies={enriched} users={users ?? []} currentUserId={user.id} isAdmin={!isManager} />
      </main>
    </>
  );
}
