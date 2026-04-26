import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import LeadDetail from "./LeadDetail";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: lead } = await admin
    .from("leads")
    .select(`
      *,
      contacts(id, full_name, phone, email, telegram_id, telegram_username, maks_id),
      companies(id, name, city, region, timezone, legal_address),
      users!leads_assigned_to_fkey(id, full_name)
    `)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!lead) notFound();

  // Load funnel stages for this lead's funnel
  const { data: funnelStages } = lead.funnel_id
    ? await admin
        .from("funnel_stages")
        .select("*")
        .eq("funnel_id", lead.funnel_id)
        .order("sort_order")
    : { data: [] };

  // Load all lead funnels (for funnel switcher)
  const { data: leadFunnels } = await admin
    .from("funnels")
    .select("id, name, type, is_default")
    .eq("type", "lead")
    .order("is_default", { ascending: false });

  const { data: communications } = await admin
    .from("communications")
    .select("*, users!communications_created_by_fkey(full_name)")
    .or(`lead_id.eq.${id},and(entity_type.eq.lead,entity_id.eq.${id})`)
    .order("created_at", { ascending: false });

  const { data: tasks } = await admin
    .from("tasks")
    .select("*, users!tasks_assigned_to_fkey(full_name)")
    .eq("entity_type", "lead")
    .eq("entity_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const { data: leadProducts } = await admin
    .from("lead_products")
    .select("*, products(name, sku, image_url)")
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
