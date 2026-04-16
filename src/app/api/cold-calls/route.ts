import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, id, field, value } = await req.json();
  const admin = createAdminClient();

  if (action === "update" && id && field) {
    await admin.from("cold_calls").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete" && id) {
    await admin.from("cold_calls").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_all") {
    await admin.from("cold_calls").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
