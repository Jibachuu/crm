import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import CallsClient from "./CallsClient";

export default async function CallsPage() {
  const supabase = await createClient();

  const { data: calls } = await supabase
    .from("communications")
    .select("*, contacts(id, full_name, company_id, companies(name))")
    .eq("channel", "phone")
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <>
      <Header title="Звонки" />
      <main className="p-6">
        <CallsClient calls={calls ?? []} />
      </main>
    </>
  );
}
