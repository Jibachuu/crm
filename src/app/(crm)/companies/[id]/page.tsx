import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import CompanyDetail from "./CompanyDetail";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (!company) notFound();

  const [{ data: contacts }, { data: deals }, { data: communications }, { data: tasks }] = await Promise.all([
    supabase.from("contacts").select("id, full_name, position, phone, email, telegram_id, telegram_username").eq("company_id", id),
    supabase.from("deals").select("id, title, stage, amount").eq("company_id", id),
    supabase
      .from("communications")
      .select("*, users!communications_created_by_fkey(full_name)")
      .eq("entity_type", "company")
      .eq("entity_id", id)
      .order("created_at", { ascending: false }),
    supabase
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
          communications={communications ?? []}
          tasks={tasks ?? []}
        />
      </main>
    </>
  );
}
