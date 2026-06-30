import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, countRows } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import CompaniesList from "./CompaniesList";

export const metadata: Metadata = { title: "Компании" };

const PAGE_LIMIT = 5000;

// Все варианты флаконов с фирменной маркировкой Havenberg — и с
// УФ-печатью, и с наклейкой. Жиба 26.06.2026: «не важно с наклейкой
// или с уф печатью, мне нужны все компании, заказавшие флаконы с
// нашим лого». Лейблы формируются в InvoicesClient.expandBottleVariants
// — точное совпадение важно.
const HAVENBERG_LABELS = new Set([
  "С УФ-печатью и логотипом Havenberg",
  "С наклейкой и логотипом Havenberg",
]);

export default async function CompaniesPage() {
  const admin = createAdminClient();

  const [companies, users, totalActive, havenbergRows] = await Promise.all([
    fetchAll(admin, "companies", `*, users!companies_assigned_to_fkey(id, full_name), venue_types(id, name)`, {
      order: { column: "name" }, notDeleted: true, limit: PAGE_LIMIT,
    }),
    fetchAll(admin, "users", "id, full_name", {
      eq: { is_active: true },
      order: { column: "full_name" },
    }),
    countRows(admin, "companies", { notDeleted: true }),
    // Все deal_products с не-пустым variants + company_id через JOIN на
    // deals. Variants — JSONB array, фильтровать на стороне Postgres по
    // labelу хитро через PostgREST, поэтому тащим всё non-empty и
    // фильтруем в JS (записей сотни, не критично).
    admin
      .from("deal_products")
      .select("variants, deals!inner(company_id, deleted_at)")
      .neq("variants", "[]")
      .limit(20000)
      .then((r) => r.data ?? []),
  ]);

  // Сжимаем в Set company_id, у кого хотя бы в одной сделке (не удалённой)
  // есть variant с лейблом Havenberg-УФ. PostgREST может вернуть deals как
  // объект ИЛИ как single-item массив в зависимости от схемы FK —
  // нормализуем оба варианта.
  const havenbergCompanyIds = new Set<string>();
  type Row = { variants?: unknown; deals?: { company_id?: string | null; deleted_at?: string | null } | Array<{ company_id?: string | null; deleted_at?: string | null }> | null };
  for (const row of havenbergRows as unknown as Row[]) {
    const deal = Array.isArray(row.deals) ? row.deals[0] : row.deals;
    if (!deal || deal.deleted_at || !deal.company_id) continue;
    const variants = Array.isArray(row.variants) ? row.variants : [];
    for (const v of variants as Array<{ label?: string }>) {
      if (v?.label && HAVENBERG_LABELS.has(v.label)) {
        havenbergCompanyIds.add(deal.company_id);
        break;
      }
    }
  }

  return (
    <>
      <Header title="Компании" />
      <main className="p-6">
        <CompaniesList
          initialCompanies={companies}
          users={users}
          totalActive={totalActive}
          pageLimit={PAGE_LIMIT}
          havenbergCompanyIds={Array.from(havenbergCompanyIds)}
        />
      </main>
    </>
  );
}
