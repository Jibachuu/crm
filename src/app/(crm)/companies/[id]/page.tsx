import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import CompanyDetail from "./CompanyDetail";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: company } = await admin
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (!company) notFound();

  const [{ data: contacts }, { data: deals }, { data: leads }, { data: communications }, { data: tasks }] = await Promise.all([
    admin.from("contacts").select("id, full_name, position, phone, email, telegram_id, telegram_username, maks_id").eq("company_id", id),
    admin.from("deals").select("id, title, stage, amount, created_at").eq("company_id", id),
    admin.from("leads").select("id, title, status, source, created_at").eq("company_id", id).order("created_at", { ascending: false }),
    admin
      .from("communications")
      .select("*, users!communications_created_by_fkey(full_name)")
      .or(`company_id.eq.${id},and(entity_type.eq.company,entity_id.eq.${id})`)
      .order("created_at", { ascending: false }),
    admin
      .from("tasks")
      .select("*, users!tasks_assigned_to_fkey(full_name)")
      .eq("entity_type", "company")
      .eq("entity_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <Header title={company.name} />
      <main className="p-6">
        <CompanyDetail
          company={company}
          contacts={contacts ?? []}
          deals={deals ?? []}
          leads={leads ?? []}
          communications={communications ?? []}
          tasks={tasks ?? []}
        />
      </main>
    </>
  );
}
