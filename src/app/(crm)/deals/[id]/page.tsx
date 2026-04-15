import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import DealDetail from "./DealDetail";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: deal } = await supabase
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
    ? await supabase
        .from("funnel_stages")
        .select("*")
        .eq("funnel_id", deal.funnel_id)
        .order("sort_order")
    : { data: [] };

  const { data: communications } = await supabase
    .from("communications")
    .select("*, users!communications_created_by_fkey(full_name)")
    .eq("entity_type", "deal")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*, users!tasks_assigned_to_fkey(full_name)")
    .eq("entity_type", "deal")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  const { data: dealProducts } = await supabase
    .from("deal_products")
    .select("*, products(name, sku)")
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
