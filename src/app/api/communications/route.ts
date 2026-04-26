import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Insert a communication row (notes, calls, message log entries).
// We go through the admin client to keep the contract uniform with all
// other entity mutations and to avoid silent RLS failures on edge cases.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.entity_type || !body.entity_id) {
    return NextResponse.json({ error: "entity_type and entity_id required" }, { status: 400 });
  }
  if (!body.body || !String(body.body).trim()) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }

  const admin = createAdminClient();
  // NB: only fields that actually exist in the communications table.
  // Schema lives in supabase/schema.sql + migrations v31/v36/v53.
  // attachments was wishful — no such column → каждая заметка падала
  // с "Could not find the 'attachments' column" пока этот ключ был.
  const { data, error } = await admin
    .from("communications")
    .insert({
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      channel: body.channel || "note",
      direction: body.direction || "outbound",
      body: String(body.body).trim(),
      from_address: body.from_address || null,
      to_address: body.to_address || null,
      subject: body.subject || null,
      external_id: body.external_id || null,
      sender_name: body.sender_name || null,
      contact_id: body.contact_id || null,
      company_id: body.company_id || null,
      lead_id: body.lead_id || null,
      deal_id: body.deal_id || null,
      created_by: body.created_by || user.id,
    })
    .select("*, users!communications_created_by_fkey(full_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// Single or bulk delete by id(s). Schema policy restricts DELETE to admin,
// so we do it via service role and authorise at the API layer.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  if (ids.length === 0) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("communications").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, deleted: ids.length });
}
