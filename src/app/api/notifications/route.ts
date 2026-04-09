import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin";

  // Admin sees ALL tasks, others see only their own
  const admin = createAdminClient();
  let query = admin.from("tasks")
    .select("id, title, due_date, status, entity_type, entity_id, created_at, assigned_to, users!tasks_assigned_to_fkey(full_name)")
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (!isAdmin) {
    query = query.eq("assigned_to", user.id);
  }

  const { data: tasks } = await query;

  const notifications: {
    id: string;
    type: "task" | "message";
    title: string;
    subtitle?: string;
    link?: string;
    date: string;
  }[] = [];

  const today = new Date().toISOString().slice(0, 10);

  for (const t of tasks ?? []) {
    const dueDate = t.due_date ? new Date(t.due_date) : null;
    const isOverdue = dueDate && dueDate < new Date() && t.due_date.slice(0, 10) < today;
    const isToday = t.due_date && t.due_date.slice(0, 10) === today;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assigneeName = isAdmin && t.assigned_to !== user.id ? ` (${(t.users as any)?.full_name ?? ""})` : "";
    const prefix = isOverdue ? "Просрочена" : isToday ? "Сегодня" : "";
    notifications.push({
      id: `task-${t.id}`,
      type: "task",
      title: prefix ? `${prefix}: ${t.title}${assigneeName}` : `${t.title}${assigneeName}`,
      subtitle: t.due_date ? `Срок: ${new Date(t.due_date).toLocaleDateString("ru-RU")}` : undefined,
      link: t.entity_type && t.entity_id ? `/${t.entity_type}s/${t.entity_id}` : "/tasks",
      date: t.created_at,
    });
  }

  // Sort: overdue first, then today, then rest
  notifications.sort((a, b) => {
    const aOverdue = a.title.startsWith("Просрочена") ? 0 : a.title.startsWith("Сегодня") ? 1 : 2;
    const bOverdue = b.title.startsWith("Просрочена") ? 0 : b.title.startsWith("Сегодня") ? 1 : 2;
    return aOverdue - bOverdue;
  });

  return NextResponse.json({ notifications, count: notifications.length });
}
