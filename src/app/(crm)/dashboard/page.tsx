import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [leads, deals, contacts, companies, tasks] = await Promise.all([
    fetchAll(supabase, "leads", "id, title, status, stage, stage_id, created_at, contacts(full_name)", {
      order: { column: "created_at", ascending: false },
    }),
    fetchAll(supabase, "deals", "id, title, stage, stage_id, amount, created_at", {
      order: { column: "created_at", ascending: false },
    }),
    fetchAll(supabase, "contacts", "id, created_at", {
      order: { column: "created_at", ascending: false },
    }),
    fetchAll(supabase, "companies", "id, created_at", {
      order: { column: "created_at", ascending: false },
    }),
    fetchAll(supabase, "tasks", "id, status", {}),
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
        />
      </main>
    </>
  );
}
