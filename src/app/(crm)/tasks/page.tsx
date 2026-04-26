import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import TasksBoard from "./TasksBoard";

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*, users!tasks_assigned_to_fkey(full_name)")
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });

  return (
    <>
      <Header title="Задачи" />
      <main className="p-6">
        <TasksBoard initialTasks={tasks ?? []} />
      </main>
    </>
  );
}
