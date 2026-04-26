import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  const admin = createAdminClient();

  // Create production order from deal
  if (action === "create") {
    const { deal_id, worker_id, notes } = body;
    const { data: deal } = await admin.from("deals").select("id, company_id, contact_id, assigned_to").eq("id", deal_id).single();
    if (!deal) return NextResponse.json({ error: "Сделка не найдена" }, { status: 404 });

    // Check if already exists
    const { data: existing } = await admin.from("order_production").select("id").eq("deal_id", deal_id).limit(1);
    if (existing?.length) return NextResponse.json({ error: "Заказ уже создан для этой сделки" }, { status: 400 });

    const { data: prod, error } = await admin.from("order_production").insert({
      deal_id, company_id: deal.company_id, contact_id: deal.contact_id,
      manager_id: deal.assigned_to, worker_id: worker_id || null, notes: notes || null,
    }).select("*").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Log
    await admin.from("production_log").insert({ production_id: prod.id, user_id: user.id, action: "created", to_stage: "new" });

    // Notify worker — guarded against duplicate creation if the action
    // is replayed (the production page used to spam these tasks).
    if (worker_id) {
      const { data: dealData } = await admin.from("deals").select("title, companies(name)").eq("id", deal_id).single();
      const companyName = (dealData?.companies as unknown as { name: string })?.name ?? "";
      const taskTitle = `Новый заказ в работу: ${companyName} — ${dealData?.title ?? ""}`;
      const { data: dup } = await admin
        .from("tasks")
        .select("id")
        .eq("entity_type", "deal").eq("entity_id", deal_id)
        .eq("title", taskTitle)
        .neq("status", "done")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (!dup) {
        await admin.from("tasks").insert({
          title: taskTitle,
          entity_type: "deal", entity_id: deal_id,
          assigned_to: worker_id, created_by: user.id,
          status: "pending", priority: "high",
        });
      }
    }

    return NextResponse.json({ production: prod });
  }

  // Move stage
  if (action === "move") {
    const { id, stage, tracking_number, estimated_arrival } = body;
    const { data: current } = await admin.from("order_production").select("stage, manager_id, company_id, deal_id").eq("id", id).single();
    if (!current) return NextResponse.json({ error: "Не найден" }, { status: 404 });

    const update: Record<string, unknown> = { stage, updated_at: new Date().toISOString() };
    if (tracking_number) { update.tracking_number = tracking_number; update.shipped_at = new Date().toISOString(); }
    if (estimated_arrival) update.estimated_arrival = estimated_arrival;

    await admin.from("order_production").update(update).eq("id", id);
    await admin.from("production_log").insert({ production_id: id, user_id: user.id, action: "stage_change", from_stage: current.stage, to_stage: stage });

    // Auto-create tasks (deduped — was spawning dupes on every replay,
    // see "Кинестетика — 4× одна и та же задача" feedback 15.04).
    const dealIdForTask = current.deal_id;
    const userIdForTask = user.id;
    async function ensureTask(opts: { title: string; assigned_to: string; priority?: string; due_date?: string }) {
      const { data: dup } = await admin
        .from("tasks")
        .select("id")
        .eq("entity_type", "deal").eq("entity_id", dealIdForTask)
        .eq("title", opts.title)
        .neq("status", "done")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (dup) return;
      await admin.from("tasks").insert({
        title: opts.title,
        entity_type: "deal", entity_id: dealIdForTask,
        assigned_to: opts.assigned_to, created_by: userIdForTask,
        status: "pending",
        priority: opts.priority ?? "medium",
        due_date: opts.due_date ?? null,
      });
    }

    if (stage === "shipped" && tracking_number && current.manager_id) {
      const { data: company } = await admin.from("companies").select("name").eq("id", current.company_id).single();
      await ensureTask({
        title: `Передать трек-номер клиенту — ${company?.name ?? ""}: ${tracking_number}`,
        assigned_to: current.manager_id,
        priority: "high",
      });
    }

    if (stage === "delivered" && estimated_arrival && current.manager_id) {
      // Review request only makes sense when the deal actually closed as won.
      // Previously the task was created for every delivery, including
      // those tied to refused/refunded deals.
      const { data: deal } = await admin.from("deals").select("stage").eq("id", current.deal_id).single();
      if (deal?.stage === "won") {
        const { data: company } = await admin.from("companies").select("name").eq("id", current.company_id).single();
        const reviewDate = new Date(new Date(estimated_arrival).getTime() + 3 * 86400000).toISOString();
        await ensureTask({
          title: `Запросить отзыв у ${company?.name ?? ""} — заказ доставлен`,
          assigned_to: current.manager_id,
          priority: "medium",
          due_date: reviewDate,
        });
      }
    }

    return NextResponse.json({ ok: true });
  }

  // Update fields
  if (action === "update") {
    const { id, ...fields } = body;
    delete fields.action;
    await admin.from("order_production").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  // Add comment
  if (action === "comment") {
    const { production_id, comment } = body;
    await admin.from("production_log").insert({ production_id, user_id: user.id, action: "comment", comment });
    return NextResponse.json({ ok: true });
  }

  // Delete
  if (action === "delete") {
    const { id } = body;
    await admin.from("order_production").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  // Get log
  if (action === "get_log") {
    const { production_id } = body;
    const { data: log } = await admin.from("production_log").select("*").eq("production_id", production_id).order("created_at", { ascending: true });
    return NextResponse.json({ log: log ?? [] });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
