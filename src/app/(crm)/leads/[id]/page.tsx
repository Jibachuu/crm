import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import LeadDetail from "./LeadDetail";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // Ensure auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select(`
      *,
      contacts(id, full_name, phone, email, telegram_id, telegram_username, maks_id, survey_discount),
      companies(id, name, city, region, timezone, legal_address),
      users!leads_assigned_to_fkey(id, full_name)
    `)
    .eq("id", id)
    .single();

  if (!lead) notFound();

  // Load funnel stages for this lead's funnel
  const { data: funnelStages } = lead.funnel_id
    ? await supabase
        .from("funnel_stages")
        .select("*")
        .eq("funnel_id", lead.funnel_id)
        .order("sort_order")
    : { data: [] };

  // Load all lead funnels (for funnel switcher)
  const { data: leadFunnels } = await supabase
    .from("funnels")
    .select("id, name, type, is_default")
    .eq("type", "lead")
    .order("is_default", { ascending: false });

  const { data: communications } = await supabase
    .from("communications")
    .select("*, users!communications_created_by_fkey(full_name)")
    .or(`lead_id.eq.${id},and(entity_type.eq.lead,entity_id.eq.${id})`)
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
          funnelStages={funnelStages ?? []}
          leadFunnels={leadFunnels ?? []}
        />
      </main>
    </>
  );
}
