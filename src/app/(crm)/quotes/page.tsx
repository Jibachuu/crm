import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import QuotesList from "./QuotesList";

export default async function QuotesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Auto-cleanup trash: permanently delete quotes deleted more than 30 days ago
  const trashCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await admin.from("quotes").delete().lt("deleted_at", trashCutoff);

  const [{ data: quotes }, { data: companies }, { data: contacts }, products, { data: users }, { data: invoices }] = await Promise.all([
    admin.from("quotes")
      .select("*, companies(id, name), contacts(id, full_name), users!quotes_manager_id_fkey(id, full_name), deals(id, title)")
      .order("created_at", { ascending: false }),
    admin.from("companies").select("id, name, inn").order("name"),
    admin.from("contacts").select("id, full_name, phone, email, company_id").order("full_name"),
    fetchAll(admin, "products", "id, name, sku, base_price, category, subcategory, liters, container, description, image_url", { eq: { is_active: true }, order: { column: "name" } }),
    admin.from("users").select("id, full_name, email").eq("is_active", true).order("full_name"),
    admin.from("invoices").select("id, invoice_number, buyer_company_id, buyer_name, total_amount").order("created_at", { ascending: false }).limit(100),
  ]);

  // Load category tiers safely (table may not exist yet)
  let categoryTiers: unknown[] = [];
  try {
    const { data } = await admin.from("category_price_tiers").select("*");
    categoryTiers = data ?? [];
  } catch { /* table doesn't exist yet */ }

  return (
    <>
      <Header title="Коммерческие предложения" />
      <main className="p-6">
        <QuotesList
          initialQuotes={quotes ?? []}
          companies={companies ?? []}
          contacts={contacts ?? []}
          products={products}
          users={users ?? []}
          currentUserId={user.id}
          invoices={invoices ?? []}
          categoryTiers={categoryTiers ?? []}
        />
      </main>
    </>
  );
}
