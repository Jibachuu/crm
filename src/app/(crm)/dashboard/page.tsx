import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [leads, deals, contacts, companies, tasks, users] = await Promise.all([
    fetchAll(supabase, "leads", "id, title, status, stage_id, assigned_to, created_at, contacts(full_name)", {
      order: { column: "created_at", ascending: false },
    }),
    fetchAll(supabase, "deals", "id, title, stage, stage_id, amount, assigned_to, created_at", {
      order: { column: "created_at", ascending: false },
    }),
    fetchAll(supabase, "contacts", "id, assigned_to, created_at", {
      order: { column: "created_at", ascending: false },
    }),
    fetchAll(supabase, "companies", "id, assigned_to, created_at", {
      order: { column: "created_at", ascending: false },
    }),
    fetchAll(supabase, "tasks", "id, status, assigned_to", {}),
    fetchAll(supabase, "users", "id, full_name, role", { eq: { is_active: true }, order: { column: "full_name" } }),
  ]);

  return (
    <>
      <Header title="Дашборд" />
      <main className="p-6">
        <DashboardClient
          leads={leads as any[]}
          deals={deals as any[]}
          contacts={contacts as any[]}
          companies={companies as any[]}
          tasks={tasks as any[]}
          users={users as any[]}
        />
      </main>
    </>
  );
}
