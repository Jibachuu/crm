import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import ProductsList from "./ProductsList";

export const metadata: Metadata = { title: "Товары" };

export default async function ProductsPage() {
  const supabase = await createClient();
  const products = await fetchAll(supabase, "products", "*", {
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
