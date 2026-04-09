import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Called by Vercel Cron daily or manually
// Also triggered on deal stage change via client

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({ action: "daily" }));
  const { action, deal_id, entity_type, entity_id, stage_id, old_stage_id } = body;
  const admin = createAdminClient();

  const results: string[] = [];

  // ── FUNNEL STAGE CHANGE AUTOMATIONS ──
  if (action === "stage_change") {
    if (stage_id && entity_id) {
      // Load automations for this stage
      const { data: automations } = await admin
        .from("stage_automations")
        .select("*")
        .eq("stage_id", stage_id)
        .eq("trigger", "on_enter");

      if (automations?.length) {
        // Load entity data
        const table = entity_type === "lead" ? "leads" : "deals";
        const { data: entity } = await admin
          .from(table)
          .select("id, title, assigned_to, company_id, companies(name)")
          .eq("id", entity_id)
          .single();

        if (entity) {
          const companyName = (entity.companies as unknown as { name: string } | null)?.name ?? "";
          // Cancel pending tasks from old stage automations
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

          // Find assignee by role
          async function getAssignee(role: string) {
            if (role === "manager") return entity!.assigned_to;
            const { data: users } = await admin.from("users")
              .select("id").eq("role", role === "head" ? "supervisor" : role).eq("is_active", true).limit(1);
            return users?.[0]?.id ?? entity!.assigned_to;
          }

          for (const auto of automations) {
            if (auto.notes === "ручная") continue; // Skip manual tasks
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
              title,
              entity_type,
              entity_id,
              assigned_to: assignee,
              created_by: assignee ?? entity.assigned_to,
              status: "pending",
              priority: "medium",
              due_date: dueDate,
            });
            results.push(`Auto-task: ${title}`);
          }
        }
      }
    }
    return NextResponse.json({ ok: true, results });
  }

  // ── 3.1 Follow-up after deal stage change ──
  if (action === "deal_stage_change" && deal_id) {
    // Check if deal just moved to "proposal" stage (КП отправлено)
    const { data: deal } = await admin.from("deals").select("id, title, stage, assigned_to, company_id, companies(name)").eq("id", deal_id).single();
    if (deal && deal.stage === "proposal" && deal.assigned_to) {
      const companyName = (deal.companies as unknown as { name: string } | null)?.name ?? "";
      // Create follow-up task in 3 days
      const due3 = new Date(Date.now() + 3 * 86400000).toISOString();
      await admin.from("tasks").insert({
        title: `Follow-up по КП — ${deal.title}, компания ${companyName}`,
        entity_type: "deal", entity_id: deal.id,
        assigned_to: deal.assigned_to,
        created_by: deal.assigned_to,
        status: "pending", priority: "medium",
        due_date: due3,
      });
      results.push(`Follow-up task created for deal ${deal.title}`);
    }
  }

  // ── 3.2 Lifecycle reminders (on deal won) ──
  if (action === "deal_won" && deal_id) {
    const { data: deal } = await admin.from("deals").select("id, title, assigned_to, company_id, companies(name)").eq("id", deal_id).single();
    if (deal) {
      const { data: items } = await admin.from("deal_products")
        .select("product_id, lifecycle_days, products(name)")
        .eq("deal_id", deal_id)
        .eq("product_block", "order")
        .gt("lifecycle_days", 0);

      for (const item of items ?? []) {
        const days = item.lifecycle_days ?? 0;
        if (days <= 0) continue;
        const dueDate = new Date(Date.now() + days * 86400000).toISOString();
        const productName = (item.products as unknown as { name: string } | null)?.name ?? "товар";
        const companyName = (deal.companies as unknown as { name: string } | null)?.name ?? "";
        await admin.from("tasks").insert({
          title: `Напомнить о пополнении ${productName} — ${companyName}`,
          entity_type: "deal", entity_id: deal.id,
          assigned_to: deal.assigned_to,
          created_by: deal.assigned_to,
          status: "pending", priority: "medium",
          due_date: dueDate,
        });
        results.push(`Lifecycle task: ${productName} in ${days} days`);
      }
    }
  }

  // ── 3.3 Check delivery (daily) ──
  if (action === "daily" || action === "check_delivery") {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);

    const { data: wonDeals } = await admin.from("deals")
      .select("id, title, assigned_to, company_id, companies(name), closed_at")
      .eq("stage", "won")
      .gte("closed_at", threeDaysAgo + "T00:00:00")
      .lte("closed_at", twoDaysAgo + "T23:59:59");

    for (const deal of wonDeals ?? []) {
      // Check if task already exists
      const { data: existing } = await admin.from("tasks")
        .select("id")
        .eq("entity_type", "deal").eq("entity_id", deal.id)
        .ilike("title", "%Проверить получение%")
        .limit(1);
      if (existing?.length) continue;

      const companyName = (deal.companies as unknown as { name: string } | null)?.name ?? "";
      await admin.from("tasks").insert({
        title: `Проверить получение заказа — ${companyName}`,
        entity_type: "deal", entity_id: deal.id,
        assigned_to: deal.assigned_to,
        created_by: deal.assigned_to,
        status: "pending", priority: "high",
      });
      results.push(`Check delivery: ${companyName}`);
    }
  }

  // ── 3.4 Reactivation of sleeping clients (daily) ──
  if (action === "daily" || action === "reactivation") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    // Get all companies with their last activity
    const { data: companies } = await admin.from("companies").select("id, name, assigned_to").not("assigned_to", "is", null);

    for (const company of companies ?? []) {
      // Check last activity
      const { data: recentDeals } = await admin.from("deals")
        .select("id").eq("company_id", company.id)
        .or("stage.eq.lead,stage.eq.proposal,stage.eq.negotiation,stage.eq.order_assembly")
        .limit(1);
      if (recentDeals?.length) continue; // Has active deals

      const { data: recentComms } = await admin.from("communications")
        .select("created_at").eq("entity_type", "company").eq("entity_id", company.id)
        .order("created_at", { ascending: false }).limit(1);

      const lastContact = recentComms?.[0]?.created_at;
      if (lastContact && lastContact > thirtyDaysAgo) continue; // Recent activity

      // Check if reactivation task already exists
      const { data: existingTask } = await admin.from("tasks")
        .select("id").eq("entity_type", "company").eq("entity_id", company.id)
        .ilike("title", "%Реактивация%").eq("status", "pending").limit(1);
      if (existingTask?.length) continue;

      const lastDate = lastContact ? new Date(lastContact).toLocaleDateString("ru-RU") : "нет данных";
      await admin.from("tasks").insert({
        title: `Реактивация — ${company.name}, последний контакт ${lastDate}`,
        entity_type: "company", entity_id: company.id,
        assigned_to: company.assigned_to,
        created_by: company.assigned_to,
        status: "pending", priority: "low",
      });
      results.push(`Reactivation: ${company.name}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}

// GET for Vercel Cron
export async function GET() {
  const res = await fetch(process.env.NEXT_PUBLIC_APP_URL + "/api/automations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "daily" }),
  }).catch(() => null);
  return NextResponse.json({ triggered: true });
}
