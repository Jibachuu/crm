import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import ProductsList from "./ProductsList";

export default async function ProductsPage() {
  const supabase = await createClient();
  const products = await fetchAll(supabase, "products", "*, product_attributes(*), product_variants(id, attributes, price, stock)", {
    order: { column: "name" },
    // Load all products — active/inactive filter handled on client
  });

  return (
    <>
      <Header title="Товары" />
      <main className="p-6">
        <ProductsList initialProducts={products} />
      </main>
    </>
  );
}
