import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import SamplesList from "./SamplesList";

export const metadata: Metadata = { title: "Пробники" };

export default async function SamplesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Try to filter soft-deleted; fall back without the filter if the
  // column doesn't exist yet (migration_v71 not applied — without the
  // fallback the page just shows "Пробников не найдено").
  async function loadSamples() {
    const sel = "*, companies(id, name), contacts(id, full_name), users!samples_assigned_to_fkey(id, full_name), logist:users!samples_logist_id_fkey(id, full_name)";
    const res = await admin.from("samples")
      .select(sel)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (res.error && /deleted_at/i.test(res.error.message)) {
      const fallback = await admin.from("samples").select(sel).order("created_at", { ascending: false });
      return fallback;
    }
    return res;
  }

  const [{ data: samples }, companies, contacts, { data: users }, leads, deals] = await Promise.all([
    loadSamples(),
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
