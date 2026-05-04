import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET deal_contacts for a deal — admin-routed because RLS on the
// junction table hid rows from manager-role users on direct SELECT.
// Symptom 2026-05-04: contact added via POST landed in DB but
// disappeared after F5 — the SELECT returned [] silently.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("deal_id");
  if (!dealId) return NextResponse.json({ error: "deal_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("deal_contacts")
    .select("id, contact_id, is_primary, contacts(id, full_name, phone, email, telegram_id, maks_id)")
    .eq("deal_id", dealId)
    .order("is_primary", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ contacts: data ?? [] });
}

// Add a contact to a deal via the deal_contacts junction table.
// Unique (deal_id, contact_id) — second insert returns the existing row
// instead of failing, so the UI gets a deterministic response either way.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.deal_id || !body.contact_id) {
    return NextResponse.json({ error: "deal_id and contact_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const upsert = await admin
    .from("deal_contacts")
    .upsert(
      { deal_id: body.deal_id, contact_id: body.contact_id, is_primary: !!body.is_primary },
      { onConflict: "deal_id,contact_id", ignoreDuplicates: false }
    )
    .select("id, contact_id, is_primary, contacts(id, full_name, phone, email, telegram_id, maks_id)")
    .single();

  if (upsert.error) return NextResponse.json({ error: upsert.error.message }, { status: 400 });
  return NextResponse.json(upsert.data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id && !(body.deal_id && body.contact_id)) {
    return NextResponse.json({ error: "id OR (deal_id+contact_id) required" }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin.from("deal_contacts").delete();
  if (body.id) query = query.eq("id", body.id);
  else query = query.eq("deal_id", body.deal_id).eq("contact_id", body.contact_id);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
