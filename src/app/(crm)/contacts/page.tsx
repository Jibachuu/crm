import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import Header from "@/components/layout/Header";
import ContactsList from "./ContactsList";

export default async function ContactsPage() {
  const supabase = await createClient();

  const [contacts, companies, users] = await Promise.all([
    fetchAll(supabase, "contacts", `*, companies(id, name), users!contacts_assigned_to_fkey(id, full_name)`, {
      order: { column: "created_at", ascending: false },
    }),
    fetchAll(supabase, "companies", "id, name", { order: { column: "name" } }),
    fetchAll(supabase, "users", "id, full_name", {
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
