import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import SamplesList from "./SamplesList";

export default async function SamplesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: samples }, { data: companies }, { data: contacts }, { data: users }] = await Promise.all([
    admin.from("samples")
      .select("*, companies(id, name), contacts(id, full_name), users!samples_assigned_to_fkey(id, full_name), logist:users!samples_logist_id_fkey(id, full_name)")
      .order("created_at", { ascending: false }),
    admin.from("companies").select("id, name").order("name"),
    admin.from("contacts").select("id, full_name, phone").order("full_name"),
    admin.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  return (
    <>
      <Header title="Пробники" />
      <main className="p-6">
        <SamplesList
          initialSamples={samples ?? []}
          companies={companies ?? []}
          contacts={contacts ?? []}
          users={users ?? []}
        />
      </main>
    </>
  );
}
