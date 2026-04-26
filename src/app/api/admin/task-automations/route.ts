import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("task_automation_settings")
    .select("*")
    .order("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

// PATCH /api/admin/task-automations { id, enabled?, days_offset?, priority? }
// Admin only. UI lives in /settings → автозадачи carousel.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.enabled !== undefined) updates.enabled = !!body.enabled;
  if (body.days_offset !== undefined) updates.days_offset = Number(body.days_offset);
  if (body.priority !== undefined) updates.priority = body.priority;

  const { data, error } = await admin
    .from("task_automation_settings")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
