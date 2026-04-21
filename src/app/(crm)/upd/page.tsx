import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import UpdClient from "./UpdClient";

export default async function UpdPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: updList }, { data: companies }, products, { data: supplier }, { data: invoices }] = await Promise.all([
    admin.from("upd").select("*, companies:buyer_company_id(id, name)").order("created_at", { ascending: false }),
    admin.from("companies").select("id, name, inn, kpp, legal_address").order("name"),
    fetchAll(admin, "products", "id, name, sku, base_price, category, subcategory, liters, container", { eq: { is_active: true }, order: { column: "name" } }),
    admin.from("supplier_settings").select("*").limit(1).single(),
    admin.from("invoices").select("id, invoice_number, buyer_company_id, buyer_name, total_amount").order("created_at", { ascending: false }).limit(200),
  ]);

  return (
    <>
      <Header title="УПД (закрывающие документы)" />
      <main className="p-6">
        <UpdClient
          initialUpd={updList ?? []}
          companies={companies ?? []}
          products={products}
          supplier={supplier}
          invoices={invoices ?? []}
        />
      </main>
    </>
  );
}
