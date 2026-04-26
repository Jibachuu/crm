import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import ContactsList from "./ContactsList";

export default async function ContactsPage() {
  const admin = createAdminClient();

  const [contacts, companies, users] = await Promise.all([
    fetchAll(admin, "contacts", `*, companies(id, name), users!contacts_assigned_to_fkey(id, full_name)`, {
      order: { column: "created_at", ascending: false }, notDeleted: true,
    }),
    fetchAll(admin, "companies", "id, name", { order: { column: "name" }, notDeleted: true }),
    fetchAll(admin, "users", "id, full_name", {
      eq: { is_active: true },
      order: { column: "full_name" },
    }),
  ]);

  return (
    <>
      <Header title="Контакты" />
      <main className="p-6">
        <ContactsList initialContacts={contacts} companies={companies} users={users} />
      </main>
    </>
  );
}
