import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Header from "@/components/layout/Header";
import ColdCallsClient from "./ColdCallsClient";

export default async function ColdCallsPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  let rows: Record<string, unknown>[] = [];
  try {
    // Paginate to bypass Supabase 1000-row limit
    let offset = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await admin
        .from("cold_calls")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }
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
