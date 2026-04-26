import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Persist "I've seen this notification" state on the server so it
// survives a browser-history clear. Notification IDs are synthetic
// strings ("comm-<uuid>", "lead-<uuid>", "dm-<uuid>", "gm-<uuid>")
// produced by /api/notifications GET — we store them verbatim.
//
// POST { id }            → mark single
// POST { ids: [...] }    → mark batch (used by "Прочитать все")
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  if (ids.length === 0) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

  const admin = createAdminClient();
  const rows = ids.map((id) => ({ user_id: user.id, notification_id: id }));
  const { error } = await admin
    .from("user_notification_reads")
    .upsert(rows, { onConflict: "user_id,notification_id", ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, marked: ids.length });
}
