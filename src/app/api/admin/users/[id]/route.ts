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

// PATCH /api/admin/users/[id] — update email, password, name, role
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as { email?: string; password?: string; full_name?: string; role?: string; is_active?: boolean };
  const admin = createAdminClient();

  // Update auth.users (email/password)
  const authUpdate: Record<string, unknown> = {};
  if (body.email) authUpdate.email = body.email;
  if (body.password) authUpdate.password = body.password;
  if (Object.keys(authUpdate).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(id, authUpdate);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Update public.users (name, role, active)
  const profileUpdate: Record<string, unknown> = {};
  if (body.full_name !== undefined) profileUpdate.full_name = body.full_name;
  if (body.role !== undefined) profileUpdate.role = body.role;
  if (body.is_active !== undefined) profileUpdate.is_active = body.is_active;
  if (body.email !== undefined) profileUpdate.email = body.email;
  if (Object.keys(profileUpdate).length > 0) {
    await admin.from("users").update(profileUpdate).eq("id", id);
  }

  const { data: profile } = await admin.from("users").select("*").eq("id", id).single();
  return NextResponse.json({ user: profile });
}
