import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import CompaniesList from "./CompaniesList";

export const metadata: Metadata = { title: "Компании" };

export default async function CompaniesPage() {
  const admin = createAdminClient();

  const [companies, users] = await Promise.all([
    fetchAll(admin, "companies", `*, users!companies_assigned_to_fkey(id, full_name)`, {
      order: { column: "name" }, notDeleted: true,
    }),
    fetchAll(admin, "users", "id, full_name", {
      eq: { is_active: true },
      order: { column: "full_name" },
    }),
  ]);

  return (
    <>
      <Header title="Компании" />
      <main className="p-6">
        <CompaniesList initialCompanies={companies} users={users} />
      </main>
    </>
  );
}
