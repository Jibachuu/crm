import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Create a new contact (bypasses RLS via admin client)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("contacts")
    .insert({
      full_name: body.full_name,
      last_name: body.last_name || null,
      middle_name: body.middle_name || null,
      position: body.position || null,
      phone: body.phone || null,
      phone_mobile: body.phone_mobile || null,
      phone_other: body.phone_other || null,
      email: body.email || null,
      email_other: body.email_other || null,
      telegram_id: body.telegram_id || null,
      telegram_username: body.telegram_username || null,
      maks_id: body.maks_id || null,
      company_id: body.company_id || null,
      assigned_to: body.assigned_to || null,
      description: body.description || null,
      created_by: user.id,
    })
    .select("*, companies(id, name), users!contacts_assigned_to_fkey(id, full_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// Partial update — same pattern as deals/leads/companies. Only touches fields
// the caller explicitly sent, so toggling `survey_discount` doesn't wipe
// phone/email or reassign the contact to nobody.
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};

  for (const f of [
    "full_name", "last_name", "middle_name", "position",
    "phone", "phone_mobile", "phone_other",
    "email", "email_other",
    "telegram_id", "telegram_username", "maks_id",
    "company_id", "assigned_to", "description",
  ] as const) {
    if (body[f] !== undefined) updates[f] = body[f] || null;
  }

  if (body.survey_discount !== undefined) updates.survey_discount = !!body.survey_discount;
  if (body.survey_passed !== undefined) updates.survey_passed = !!body.survey_passed;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("contacts")
    .update(updates)
    .eq("id", body.id)
    .select("*, companies(id, name), users!contacts_assigned_to_fkey(id, full_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
