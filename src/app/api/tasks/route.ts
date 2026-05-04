import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/tasks — create. Routed through admin client because RLS on
// tasks blocks managers from inserting (apr-27 sweep doc), which made
// CreateTaskModal hang silently for non-admin users (backlog v5 §1.6.1).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tasks")
    .insert({
      title: body.title,
      description: body.description ?? null,
      priority: body.priority ?? "medium",
      due_date: body.due_date ?? null,
      assigned_to: body.assigned_to ?? null,
      entity_type: body.entity_type ?? null,
      entity_id: body.entity_id ?? null,
      status: "pending",
      created_by: user.id,
    })
    .select("*, users!tasks_assigned_to_fkey(full_name), creator:users!tasks_created_by_fkey(full_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.status !== undefined) updates.status = body.status;
  if (body.due_date !== undefined) updates.due_date = body.due_date;
  if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;

  const { data, error } = await admin
    .from("tasks")
    .update(updates)
    .eq("id", body.id)
    .select("*, users!tasks_assigned_to_fkey(full_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  if (ids.length === 0) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("tasks").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, deleted: ids.length });
}
