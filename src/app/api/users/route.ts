import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/users — minimal read-only list of active employees for client
// dropdowns (assignee pickers in tasks/leads/deals/comms). RLS on the
// users table can hide rows from manager-role users, which broke the
// CreateTaskModal "Исполнитель" picker (backlog v5 §1.6.1) and the /tasks
// filter (§6 / §1.6.3). Routing through the admin client makes the
// dropdown reliably populated regardless of role.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, full_name, email, role, is_active")
    .eq("is_active", true)
    .order("full_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ users: data ?? [] });
}
