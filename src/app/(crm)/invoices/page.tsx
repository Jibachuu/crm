import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import InvoicesClient from "./InvoicesClient";

export const metadata: Metadata = { title: "Счета" };

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: invoices }, { data: companies }, products, { data: deals }, { data: supplier }, { data: quotes }] = await Promise.all([
    admin.from("invoices").select("*, companies:buyer_company_id(id, name), deals(id, title)").order("created_at", { ascending: false }),
    admin.from("companies").select("id, name, inn, kpp, legal_address").order("name"),
    fetchAll(admin, "products", "id, name, sku, base_price, category, subcategory, liters, container, kind, flavor, volume_ml, description", { eq: { is_active: true }, order: { column: "name" } }),
    admin.from("deals").select("id, title").order("created_at", { ascending: false }).limit(100),
    admin.from("supplier_settings").select("*").limit(1).single(),
    admin.from("quotes").select("id, quote_number, company_id, total_amount, companies(name)").order("created_at", { ascending: false }).limit(100),
  ]);

  return (
    <>
      <Header title="Счета" />
      <main className="p-6">
        <InvoicesClient
          initialInvoices={invoices ?? []}
          companies={companies ?? []}
          products={products}
          deals={deals ?? []}
          supplier={supplier}
          quotes={quotes ?? []}
        />
      </main>
    </>
  );
}
