import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import LeadDetail from "./LeadDetail";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select(`
      *,
      contacts(id, full_name, phone, email, telegram_id),
      companies(id, name, city, region, timezone, legal_address),
      users!leads_assigned_to_fkey(id, full_name)
    `)
    .eq("id", id)
    .single();

  if (!lead) notFound();

  const { data: communications } = await supabase
    .from("communications")
    .select("*, users!communications_created_by_fkey(full_name)")
    .eq("entity_type", "lead")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*, users!tasks_assigned_to_fkey(full_name)")
    .eq("entity_type", "lead")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  const { data: leadProducts } = await supabase
    .from("lead_products")
    .select("*, products(name, sku)")
    .eq("lead_id", id);

  return (
    <>
      <Header title={lead.title} />
      <main className="p-6">
        <LeadDetail
          lead={lead}
          communications={communications ?? []}
          tasks={tasks ?? []}
          leadProducts={leadProducts ?? []}
        />
      </main>
    </>
  );
}
