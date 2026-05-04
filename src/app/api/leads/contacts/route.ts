import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Mirror of /api/deals/contacts for the lead_contacts junction table.
// Requires migration_v66.sql to be applied.

// GET — admin-routed because RLS hides rows from manager-role users
// on direct SELECT, same symptom as deals/contacts (added contact
// disappears after F5).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lead_contacts")
    .select("id, contact_id, is_primary, contacts(id, full_name, phone, email, telegram_id, maks_id)")
    .eq("lead_id", leadId)
    .order("is_primary", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ contacts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.lead_id || !body.contact_id) {
    return NextResponse.json({ error: "lead_id and contact_id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lead_contacts")
    .upsert(
      { lead_id: body.lead_id, contact_id: body.contact_id, is_primary: !!body.is_primary },
      { onConflict: "lead_id,contact_id", ignoreDuplicates: false }
    )
    .select("id, contact_id, is_primary, contacts(id, full_name, phone, email, telegram_id, maks_id)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id && !(body.lead_id && body.contact_id)) {
    return NextResponse.json({ error: "id OR (lead_id+contact_id) required" }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin.from("lead_contacts").delete();
  if (body.id) query = query.eq("id", body.id);
  else query = query.eq("lead_id", body.lead_id).eq("contact_id", body.contact_id);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
