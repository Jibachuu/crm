import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Morning digest: sends email to each user with their tasks for today.
// Called by VPS cron at 9:00 MSK daily.
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key") || "";
  if (key !== (process.env.CRON_SECRET || "artevo-cron-2026")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Get all active users
  const { data: users } = await admin.from("users").select("id, full_name, email").eq("is_active", true);

  const results: string[] = [];

  for (const user of users ?? []) {
    // Get tasks due today or overdue
    const { data: tasks } = await admin
      .from("tasks")
      .select("title, due_date, priority, status")
      .eq("assigned_to", user.id)
      .in("status", ["pending", "in_progress"])
      .or(`due_date.lte.${today}T23:59:59,due_date.is.null`)
      .order("due_date", { ascending: true })
      .limit(20);

    if (!tasks || tasks.length === 0) continue;

    const overdue = tasks.filter((t) => t.due_date && t.due_date.slice(0, 10) < today);
    const todayTasks = tasks.filter((t) => t.due_date && t.due_date.slice(0, 10) === today);
    const noDate = tasks.filter((t) => !t.due_date);

    const lines: string[] = [`Доброе утро, ${user.full_name}!`, "", `Задачи на ${today}:`, ""];
    if (overdue.length > 0) {
      lines.push(`⚠ Просрочено (${overdue.length}):`);
      for (const t of overdue) lines.push(`  - ${t.title} (до ${t.due_date?.slice(0, 10)})`);
      lines.push("");
    }
    if (todayTasks.length > 0) {
      lines.push(`📋 Сегодня (${todayTasks.length}):`);
      for (const t of todayTasks) lines.push(`  - ${t.title}`);
      lines.push("");
    }
    if (noDate.length > 0) {
      lines.push(`📌 Без срока (${noDate.length}):`);
      for (const t of noDate.slice(0, 5)) lines.push(`  - ${t.title}`);
      lines.push("");
    }

    // Send email via SMTP
    const resendKey = process.env.RESEND_API_KEY;
    const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER || "info@art-evo.ru";
    if (resendKey && user.email) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: `Artevo CRM <${fromAddr}>`,
          to: [user.email],
          subject: `Задачи на ${today} — CRM`,
          text: lines.join("\n"),
        });
        results.push(`${user.full_name}: sent ${tasks.length} tasks`);
      } catch (e) {
        results.push(`${user.full_name}: email error ${String(e).slice(0, 100)}`);
      }
    }
  }

  return NextResponse.json({ ok: true, results });
}
