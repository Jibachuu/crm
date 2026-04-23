import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import DealDetail from "./DealDetail";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: deal } = await admin
    .from("deals")
    .select(`
      *,
      contacts(id, full_name, phone, email, telegram_id, telegram_username, maks_id),
      companies(id, name, city, region, timezone, legal_address),
      users!deals_assigned_to_fkey(id, full_name)
    `)
    .eq("id", id)
    .single();

  if (!deal) notFound();

  // Load funnel stages for this deal's funnel
  const { data: funnelStages } = deal.funnel_id
    ? await admin
        .from("funnel_stages")
        .select("*")
        .eq("funnel_id", deal.funnel_id)
        .order("sort_order")
    : { data: [] };

  const { data: communications } = await admin
    .from("communications")
    .select("*, users!communications_created_by_fkey(full_name)")
    .or(`deal_id.eq.${id},and(entity_type.eq.deal,entity_id.eq.${id})`)
    .order("created_at", { ascending: false });

  const { data: tasks } = await admin
    .from("tasks")
    .select("*, users!tasks_assigned_to_fkey(full_name)")
    .eq("entity_type", "deal")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  const { data: dealProducts } = await admin
    .from("deal_products")
    .select("*, products(name, sku, image_url)")
    .eq("deal_id", id);

  return (
    <>
      <Header title={deal.title} />
      <main className="p-6">
        <DealDetail
          deal={deal}
          communications={communications ?? []}
          tasks={tasks ?? []}
          dealProducts={dealProducts ?? []}
          funnelStages={funnelStages ?? []}
        />
      </main>
    </>
  );
}
