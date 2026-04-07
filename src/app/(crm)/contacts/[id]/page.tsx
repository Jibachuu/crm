import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactDetail from "./ContactDetail";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select(`*, companies(id, name, city, region, timezone)`)
    .eq("id", id)
    .single();

  if (!contact) notFound();

  const [{ data: communications }, { data: tasks }, { data: leads }, { data: deals }] = await Promise.all([
    supabase
      .from("communications")
      .select("*, users!communications_created_by_fkey(full_name)")
      .eq("entity_type", "contact")
      .eq("entity_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*, users!tasks_assigned_to_fkey(full_name)")
      .eq("entity_type", "contact")
      .eq("entity_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("leads").select("id, title, status").eq("contact_id", id),
    supabase.from("deals").select("id, title, stage, amount").eq("contact_id", id),
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
