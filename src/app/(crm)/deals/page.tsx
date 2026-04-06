import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import DealsList from "./DealsList";

export default async function DealsPage() {
  const supabase = await createClient();

  const [deals, users] = await Promise.all([
    fetchAll(supabase, "deals", `
      *,
      contacts(id, full_name),
      companies(id, name),
      users!deals_assigned_to_fkey(id, full_name)
    `, { order: { column: "created_at", ascending: false } }),
    fetchAll(supabase, "users", "id, full_name", {
      eq: { is_active: true },
      order: { column: "full_name" },
    }),
  ]);

  return (
    <>
      <Header title="Сделки" />
      <main className="p-6">
        <DealsList initialDeals={deals} users={users} />
      </main>
    </>
  );
}
