import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Header from "@/components/layout/Header";
import ColdCallsClient from "./ColdCallsClient";

export default async function ColdCallsPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  let rows: Record<string, unknown>[] = [];
  try {
    const { data } = await admin
      .from("cold_calls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(3000);
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
