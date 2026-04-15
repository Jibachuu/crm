import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Funnel stage change automations only.
// All auto-task creation (follow-ups, lifecycle, delivery, reactivation) DISABLED per user request.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({ action: "daily" }));
  const { action, entity_type, entity_id, stage_id, old_stage_id } = body;
  const admin = createAdminClient();
  const results: string[] = [];

  // ── FUNNEL STAGE CHANGE AUTOMATIONS (manual trigger only) ──
  if (action === "stage_change" && stage_id && entity_id) {
    const { data: automations } = await admin
      .from("stage_automations")
      .select("*")
      .eq("stage_id", stage_id)
      .eq("trigger", "on_enter");

    if (automations?.length) {
      const table = entity_type === "lead" ? "leads" : "deals";
      const { data: entity } = await admin
        .from(table)
        .select("id, title, assigned_to, company_id, companies(name)")
        .eq("id", entity_id)
        .single();

      if (entity) {
        const companyName = (entity.companies as unknown as { name: string } | null)?.name ?? "";

        if (old_stage_id) {
          const { data: oldAutomations } = await admin
            .from("stage_automations")
            .select("task_title_template")
            .eq("stage_id", old_stage_id)
            .eq("is_repeating", true);
          if (oldAutomations?.length) {
            for (const oa of oldAutomations) {
              const titlePattern = oa.task_title_template
                .replace("{company}", companyName)
                .replace("{deal}", entity.title ?? "")
                .replace("{date}", "%")
                .replace("{track}", "%");
              await admin.from("tasks")
                .update({ status: "cancelled" })
                .eq("entity_type", entity_type)
                .eq("entity_id", entity_id)
                .eq("status", "pending")
                .ilike("title", titlePattern);
            }
          }
        }

        async function getAssignee(role: string) {
          if (role === "manager") return entity!.assigned_to;
          const { data: users } = await admin.from("users")
            .select("id").eq("role", role === "head" ? "supervisor" : role).eq("is_active", true).limit(1);
          return users?.[0]?.id ?? entity!.assigned_to;
        }

        for (const auto of automations) {
          if (auto.notes === "ручная") continue;
          const assignee = await getAssignee(auto.assignee_role);
          const title = auto.task_title_template
            .replace("{company}", companyName)
            .replace("{deal}", entity.title ?? "")
            .replace("{date}", new Date().toLocaleDateString("ru-RU"))
            .replace("{track}", "");
          const dueDate = auto.delay_days > 0
            ? new Date(Date.now() + auto.delay_days * 86400000).toISOString()
            : null;

          await admin.from("tasks").insert({
            title, entity_type, entity_id,
            assigned_to: assignee,
            created_by: assignee ?? entity.assigned_to,
            status: "pending", priority: "medium",
            due_date: dueDate,
          });
          results.push(`Auto-task: ${title}`);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, results });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Auto-tasks disabled" });
}
