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

  for (const t of tasks ?? []) {
    const isOverdue = t.due_date && new Date(t.due_date) < new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assigneeName = isAdmin && t.assigned_to !== user.id ? ` (${(t.users as any)?.full_name ?? ""})` : "";
    notifications.push({
      id: `task-${t.id}`,
      type: "task",
      title: isOverdue ? `⏰ Просрочена: ${t.title}${assigneeName}` : `📋 ${t.title}${assigneeName}`,
      subtitle: t.due_date ? `Срок: ${new Date(t.due_date).toLocaleDateString("ru-RU")}` : undefined,
      link: t.entity_type && t.entity_id ? `/${t.entity_type}s/${t.entity_id}` : "/tasks",
      date: t.created_at,
    });
  }

  return NextResponse.json({ notifications, count: notifications.length });
}
