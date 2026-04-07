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

  // Get companies
  let companiesQuery = admin.from("companies").select("id, name, company_type, city, region, timezone, contract_status, assigned_to, users!companies_assigned_to_fkey(full_name)");
  if (isManager) companiesQuery = companiesQuery.eq("assigned_to", user.id);

  // Get "homeless" contacts (no company_id)
  let contactsQuery = admin.from("contacts").select("id, full_name, phone, email, telegram_id, company_id").is("company_id", null);

  const [{ data: companies }, { data: homelessContacts }, { data: deals }, { data: contactDeals }, { data: tasks }, { data: contactTasks }, { data: allUsers }] = await Promise.all([
    companiesQuery.order("name"),
    contactsQuery.order("full_name"),
    admin.from("deals").select("company_id, contact_id, stage, amount, created_at").eq("stage", "won"),
    admin.from("deals").select("contact_id, stage, amount, created_at").is("company_id", null),
    admin.from("tasks").select("entity_type, entity_id, status").eq("status", "pending"),
    admin.from("tasks").select("entity_type, entity_id, status").eq("status", "pending").eq("entity_type", "contact"),
    admin.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  // LTV and last activity per company
  const ltvMap = new Map<string, number>();
  const lastDealMap = new Map<string, string>();
  for (const d of deals ?? []) {
    if (!d.company_id) continue;
    ltvMap.set(d.company_id, (ltvMap.get(d.company_id) ?? 0) + (d.amount ?? 0));
    const curr = lastDealMap.get(d.company_id);
    if (!curr || d.created_at > curr) lastDealMap.set(d.company_id, d.created_at);
  }

  // LTV and last activity per homeless contact
  const contactLtvMap = new Map<string, number>();
  const contactLastMap = new Map<string, string>();
  for (const d of contactDeals ?? []) {
    if (!d.contact_id) continue;
    if (d.stage === "won") contactLtvMap.set(d.contact_id, (contactLtvMap.get(d.contact_id) ?? 0) + (d.amount ?? 0));
    const curr = contactLastMap.get(d.contact_id);
    if (!curr || d.created_at > curr) contactLastMap.set(d.contact_id, d.created_at);
  }

  // Tasks per entity
  const taskMap = new Map<string, number>();
  for (const t of [...(tasks ?? []), ...(contactTasks ?? [])]) {
    const key = `${t.entity_type}_${t.entity_id}`;
    taskMap.set(key, (taskMap.get(key) ?? 0) + 1);
  }

  // Enriched companies
  const enrichedCompanies = (companies ?? []).map((c) => ({
    ...c,
    clientType: "company" as const,
    ltv: ltvMap.get(c.id) ?? 0,
    lastActivity: lastDealMap.get(c.id) ?? null,
    activeTasks: taskMap.get(`company_${c.id}`) ?? 0,
  }));

  // Enriched homeless contacts (shown as "clients" without company)
  const enrichedContacts = (homelessContacts ?? []).map((c) => ({
    id: c.id,
    name: c.full_name ?? "Без имени",
    company_type: null,
    city: null,
    region: null,
    timezone: null,
    contract_status: null,
    assigned_to: null,
    users: null,
    clientType: "contact" as const,
    phone: c.phone,
    email: c.email,
    telegram_id: c.telegram_id,
    ltv: contactLtvMap.get(c.id) ?? 0,
    lastActivity: contactLastMap.get(c.id) ?? null,
    activeTasks: taskMap.get(`contact_${c.id}`) ?? 0,
  }));

  const allClients = [...enrichedCompanies, ...enrichedContacts];

  return (
    <>
      <Header title="Мои клиенты" />
      <main className="p-6">
        <MyClientsGrid companies={allClients} users={allUsers ?? []} currentUserId={user.id} isAdmin={!isManager} />
      </main>
    </>
  );
}
