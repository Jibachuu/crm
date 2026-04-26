import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Header from "@/components/layout/Header";
import CallsClient from "./CallsClient";

export default async function CallsPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: calls }, { data: users }] = await Promise.all([
    supabase
      .from("communications")
      .select("*, contacts(id, full_name, company_id, companies(name)), users:created_by(id, full_name)")
      .eq("channel", "phone")
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  return (
    <>
      <Header title="Звонки" />
      <main className="p-6">
        <CallsClient calls={calls ?? []} users={users ?? []} />
      </main>
    </>
  );
}
