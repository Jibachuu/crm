import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Tasks assigned to current user that are not done
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, due_date, status, entity_type, entity_id, created_at")
    .eq("assigned_to", user.id)
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(20);

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
    notifications.push({
      id: `task-${t.id}`,
      type: "task",
      title: isOverdue ? `⏰ Просрочена: ${t.title}` : `📋 ${t.title}`,
      subtitle: t.due_date ? `Срок: ${new Date(t.due_date).toLocaleDateString("ru-RU")}` : undefined,
      link: t.entity_type && t.entity_id ? `/${t.entity_type}s/${t.entity_id}` : "/tasks",
      date: t.created_at,
    });
  }

  return NextResponse.json({ notifications, count: notifications.length });
}
