import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const RESTORABLE = ["leads", "deals", "contacts", "companies", "tasks"] as const;
type Restorable = typeof RESTORABLE[number];

const CHUNK = 50;

// POST: clear deleted_at on previously soft-deleted rows.
// Admin/supervisor only — managers should not silently restore each other's deletions.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const table = body.table as Restorable;
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

  if (!RESTORABLE.includes(table)) return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  if (ids.length === 0) return NextResponse.json({ error: "No ids provided" }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Только админ/супервайзер может восстанавливать" }, { status: 403 });
  }

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await admin.from(table).update({ deleted_at: null }).in("id", chunk);
    if (error) {
      console.error("[restore]", table, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  try {
    await admin.from("audit_log").insert(
      ids.map((id) => ({ table_name: table, row_id: id, action: "restore", actor_id: user.id, payload: { source: "api/restore" } }))
    );
  } catch (e) {
    console.warn("[audit_log restore]", e);
  }

  return NextResponse.json({ ok: true, restored: ids.length });
}
