import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactDetail from "./ContactDetail";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: contact } = await admin
    .from("contacts")
    .select(`*, companies(id, name, city, region, timezone, legal_address)`)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!contact) notFound();

  const [{ data: communications }, { data: tasks }, { data: leads }, { data: deals }] = await Promise.all([
    admin
      .from("communications")
      .select("*, users!communications_created_by_fkey(full_name)")
      .or(`contact_id.eq.${id},and(entity_type.eq.contact,entity_id.eq.${id})`)
      .order("created_at", { ascending: false }),
    admin
      .from("tasks")
      .select("*, users!tasks_assigned_to_fkey(full_name)")
      .eq("entity_type", "contact")
      .eq("entity_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin.from("leads").select("id, title, status").eq("contact_id", id).is("deleted_at", null),
    admin.from("deals").select("id, title, stage, amount").eq("contact_id", id).is("deleted_at", null),
  ]);

  return (
    <>
      <Header title={contact.full_name} />
      <main className="p-6">
        <ContactDetail
          contact={contact}
          communications={communications ?? []}
          tasks={tasks ?? []}
          leads={leads ?? []}
          deals={deals ?? []}
        />
      </main>
    </>
  );
}
