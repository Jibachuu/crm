import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, countRows } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import ContactsList from "./ContactsList";

export const metadata: Metadata = { title: "Контакты" };

const PAGE_LIMIT = 5000;

export default async function ContactsPage() {
  const admin = createAdminClient();

  const [contacts, companies, users, totalActive] = await Promise.all([
    fetchAll(admin, "contacts", `*, companies(id, name), users!contacts_assigned_to_fkey(id, full_name)`, {
      order: { column: "created_at", ascending: false }, notDeleted: true, limit: PAGE_LIMIT,
    }),
    fetchAll(admin, "companies", "id, name", { order: { column: "name" }, notDeleted: true }),
    fetchAll(admin, "users", "id, full_name", {
      eq: { is_active: true },
      order: { column: "full_name" },
    }),
    countRows(admin, "contacts", { notDeleted: true }),
  ]);

  return (
    <>
      <Header title="Контакты" />
      <main className="p-6">
        <ContactsList initialContacts={contacts} companies={companies} users={users} totalActive={totalActive} pageLimit={PAGE_LIMIT} />
      </main>
    </>
  );
}
