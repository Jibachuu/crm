import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import QuotesList from "./QuotesList";

export default async function QuotesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: quotes }, { data: companies }, { data: contacts }, { data: products }, { data: users }, { data: invoices }, { data: categoryTiers }] = await Promise.all([
    admin.from("quotes")
      .select("*, companies(id, name), contacts(id, full_name), users!quotes_manager_id_fkey(id, full_name), deals(id, title)")
      .order("created_at", { ascending: false }),
    admin.from("companies").select("id, name, inn").order("name"),
    admin.from("contacts").select("id, full_name, phone, email, company_id").order("full_name"),
    admin.from("products").select("id, name, sku, base_price, category, subcategory, description, image_url").eq("is_active", true).order("name"),
    admin.from("users").select("id, full_name, email").eq("is_active", true).order("full_name"),
    admin.from("invoices").select("id, invoice_number, buyer_company_id, buyer_name, total_amount").order("created_at", { ascending: false }).limit(100),
    admin.from("category_price_tiers").select("*"),
  ]);

  return (
    <>
      <Header title="Коммерческие предложения" />
      <main className="p-6">
        <QuotesList
          initialQuotes={quotes ?? []}
          companies={companies ?? []}
          contacts={contacts ?? []}
          products={products ?? []}
          users={users ?? []}
          currentUserId={user.id}
          invoices={invoices ?? []}
          categoryTiers={categoryTiers ?? []}
        />
      </main>
    </>
  );
}
