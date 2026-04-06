import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? supabase : null;
}

// POST /api/admin/users — create new user
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { full_name, email, password, role = "manager" } = await req.json();
  if (!email || !password || !full_name) {
    return NextResponse.json({ error: "Необходимы имя, email и пароль" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Update role and is_placeholder=false (trigger already created the public.users row)
  await admin.from("users").update({ role, is_placeholder: false, full_name }).eq("id", data.user.id);

  const { data: profile } = await admin.from("users").select("*").eq("id", data.user.id).single();
  return NextResponse.json({ user: profile });
}
