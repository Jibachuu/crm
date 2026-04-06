import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

// POST /api/admin/permissions — upsert permissions for a user
// body: { user_id, permissions: [{ resource, can_read, can_create, can_update, can_delete }] }
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { user_id, permissions } = await req.json();
  if (!user_id || !Array.isArray(permissions)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Delete existing permissions for this user and re-insert
  await admin.from("permissions").delete().eq("user_id", user_id);

  if (permissions.length > 0) {
    const rows = permissions.map((p: { resource: string; can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }) => ({
      user_id,
      resource: p.resource,
      can_read: p.can_read,
      can_create: p.can_create,
      can_update: p.can_update,
      can_delete: p.can_delete,
    }));
    const { error } = await admin.from("permissions").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
