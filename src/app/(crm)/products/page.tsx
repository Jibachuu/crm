import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import ProductsList from "./ProductsList";

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("*, product_variants(id, attributes, price, stock)")
    .order("name");

  return (
    <>
      <Header title="Товары" />
      <main className="p-6">
        <ProductsList initialProducts={products ?? []} />
      </main>
    </>
  );
}
