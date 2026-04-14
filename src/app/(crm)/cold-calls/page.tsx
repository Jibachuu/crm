import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import ColdCallsClient from "./ColdCallsClient";

export default async function ColdCallsPage() {
  const supabase = await createClient();

  let rows: Record<string, unknown>[] = [];
  try {
    const { data } = await supabase
      .from("cold_calls")
      .select("*, users!cold_calls_assigned_to_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(500);
    rows = data ?? [];
  } catch { /* table may not exist yet */ }

  const { data: users } = await supabase
    .from("users")
    .select("id, full_name")
    .eq("is_active", true);

  return (
    <>
      <Header title="Прозвон" />
      <main className="p-6">
        <ColdCallsClient initialRows={rows} users={users ?? []} />
      </main>
    </>
  );
}
