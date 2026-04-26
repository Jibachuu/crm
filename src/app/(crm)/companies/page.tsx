import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, countRows } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import CompaniesList from "./CompaniesList";

export const metadata: Metadata = { title: "Компании" };

const PAGE_LIMIT = 1000;

export default async function CompaniesPage() {
  const admin = createAdminClient();

  const [companies, users, totalActive] = await Promise.all([
    fetchAll(admin, "companies", `*, users!companies_assigned_to_fkey(id, full_name)`, {
      order: { column: "name" }, notDeleted: true, limit: PAGE_LIMIT,
    }),
    fetchAll(admin, "users", "id, full_name", {
      eq: { is_active: true },
      order: { column: "full_name" },
    }),
    countRows(admin, "companies", { notDeleted: true }),
  ]);

  return (
    <>
      <Header title="Компании" />
      <main className="p-6">
        <CompaniesList initialCompanies={companies} users={users} totalActive={totalActive} pageLimit={PAGE_LIMIT} />
      </main>
    </>
  );
}
