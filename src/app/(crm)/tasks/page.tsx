import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Header from "@/components/layout/Header";
import TasksBoard from "./TasksBoard";

export const metadata: Metadata = { title: "Задачи" };

// Build a per-entity-type → id → title map so TasksBoard can label and
// link tasks correctly. Tasks pointing at a soft-deleted entity get
// rendered as "(удалена)" instead of a 404 link.
async function buildEntityIndex(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tasks: any[]
) {
  const buckets = new Map<string, Set<string>>();
  for (const t of tasks) {
    if (!t.entity_type || !t.entity_id) continue;
    if (!buckets.has(t.entity_type)) buckets.set(t.entity_type, new Set());
    buckets.get(t.entity_type)!.add(t.entity_id);
  }

  const index: Record<string, Record<string, string>> = {};
  const tableFor: Record<string, { table: string; titleField: string }> = {
    lead: { table: "leads", titleField: "title" },
    deal: { table: "deals", titleField: "title" },
    contact: { table: "contacts", titleField: "full_name" },
    company: { table: "companies", titleField: "name" },
    sample: { table: "samples", titleField: "venue_name" },
  };

  for (const [type, ids] of buckets) {
    const cfg = tableFor[type];
    if (!cfg) continue;
    const { data } = await admin
      .from(cfg.table)
      .select(`id, ${cfg.titleField}`)
      .in("id", Array.from(ids))
      .is("deleted_at", null);
    index[type] = {};
    for (const row of data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      index[type][(row as any).id] = (row as any)[cfg.titleField] ?? "(без названия)";
    }
  }
  return index;
}

export default async function TasksPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  const [{ data: tasks }, { data: currentProfile }, { data: users }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, users!tasks_assigned_to_fkey(full_name), creator:users!tasks_created_by_fkey(full_name)")
      .is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false }),
    authUser
      ? admin.from("users").select("id, role, full_name").eq("id", authUser.id).single()
      : Promise.resolve({ data: null }),
    admin.from("users").select("id, full_name, role").eq("is_active", true).order("full_name"),
  ]);

  const entityIndex = await buildEntityIndex(admin, tasks ?? []);

  return (
    <>
      <Header title="Задачи" />
      <main className="p-6">
        <TasksBoard
          initialTasks={tasks ?? []}
          entityIndex={entityIndex}
          users={users ?? []}
          currentUser={currentProfile ?? null}
        />
      </main>
    </>
  );
}
