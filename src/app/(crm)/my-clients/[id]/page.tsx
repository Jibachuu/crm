import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import CompanyTimeline from "./CompanyTimeline";

export default async function CompanyTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: company } = await admin.from("companies").select("*, users!companies_assigned_to_fkey(full_name)").eq("id", id).single();
  if (!company) notFound();

  const [{ data: contacts }, { data: deals }, { data: leads }, { data: samples }, { data: comms }, { data: tasks }] = await Promise.all([
    admin.from("contacts").select("id, full_name, phone, email, telegram_id").eq("company_id", id),
    admin.from("deals").select("id, title, stage, amount, created_at, deal_products(quantity, total_price, products(name))").eq("company_id", id).order("created_at", { ascending: false }),
    admin.from("leads").select("id, title, status, source, created_at").eq("company_id", id).order("created_at", { ascending: false }),
    admin.from("samples").select("id, status, track_number, sent_date, created_at").eq("company_id", id).order("created_at", { ascending: false }),
    admin.from("communications").select("id, channel, direction, body, subject, sender_name, created_at").eq("entity_type", "company").eq("entity_id", id).order("created_at", { ascending: false }).limit(50),
    admin.from("tasks").select("id, title, status, priority, due_date, created_at").eq("entity_type", "company").eq("entity_id", id).order("created_at", { ascending: false }),
  ]);

  // LTV
  const wonDeals = (deals ?? []).filter((d) => d.stage === "won");
  const ltv = wonDeals.reduce((s, d) => s + (d.amount ?? 0), 0);
  const avgCheck = wonDeals.length ? ltv / wonDeals.length : 0;

  // Top products
  const productMap = new Map<string, { name: string; qty: number; total: number }>();
  for (const d of wonDeals) {
    for (const dp of d.deal_products ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (Array.isArray(dp.products) ? dp.products[0] : dp.products) as any;
      if (!p) continue;
      const curr = productMap.get(p.name) ?? { name: p.name, qty: 0, total: 0 };
      productMap.set(p.name, { ...curr, qty: curr.qty + (dp.quantity ?? 0), total: curr.total + (dp.total_price ?? 0) });
    }
  }
  const topProducts = Array.from(productMap.values()).sort((a, b) => b.total - a.total).slice(0, 3);

  return (
    <>
      <Header title={company.name} />
      <main className="p-6">
        <CompanyTimeline
          company={company}
          contacts={contacts ?? []}
          deals={deals ?? []}
          leads={leads ?? []}
          samples={samples ?? []}
          communications={comms ?? []}
          tasks={tasks ?? []}
          ltv={ltv}
          avgCheck={avgCheck}
          topProducts={topProducts}
        />
      </main>
    </>
  );
}
