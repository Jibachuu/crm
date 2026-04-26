import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import SamplesList from "./SamplesList";

export default async function SamplesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: samples }, companies, contacts, { data: users }, leads, deals] = await Promise.all([
    admin.from("samples")
      .select("*, companies(id, name), contacts(id, full_name), users!samples_assigned_to_fkey(id, full_name), logist:users!samples_logist_id_fkey(id, full_name)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    fetchAll(admin, "companies", "id, name", { order: { column: "name" }, notDeleted: true }),
    fetchAll(admin, "contacts", "id, full_name, phone", { order: { column: "full_name" }, notDeleted: true }),
    admin.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
    fetchAll(admin, "leads", "id, title, companies(name)", { order: { column: "created_at", ascending: false }, notDeleted: true }),
    fetchAll(admin, "deals", "id, title, companies(name)", { order: { column: "created_at", ascending: false }, notDeleted: true }),
  ]);

  return (
    <>
      <Header title="Пробники" />
      <main className="p-6">
        <SamplesList
          initialSamples={samples ?? []}
          companies={companies}
          contacts={contacts}
          users={users ?? []}
          leads={leads}
          deals={deals}
        />
      </main>
    </>
  );
}
