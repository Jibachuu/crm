import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Server-side search — bypasses RLS so the company-detail "+ Привязать"
// picker can find any contact, not just ones the manager can see
// directly. Used to filter `company_id IS NULL` (only orphan contacts),
// but operators wanted to re-link existing contacts too — drop that
// filter.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const onlyOrphans = searchParams.get("only_orphans") === "1";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "20"), 1), 100);

  const admin = createAdminClient();
  let query = admin
    .from("contacts")
    .select("id, full_name, phone, phone_mobile, email, company_id, companies(id, name)")
    .is("deleted_at", null)
    .order("full_name");
  if (onlyOrphans) query = query.is("company_id", null);
  if (q.length >= 2) {
    // ilike across name + phone columns + email so search by digits or
    // email also works.
    //
    // Cyrillic ё/е equivalence: PostgreSQL treats them as distinct
    // characters, so searching "Артём" missed "Артем" (real bug
    // 2026-05-06). Generate up to three name-variants and OR them.
    // Phone/email don't have ё, so they keep the original term.
    const qLower = q.toLowerCase();
    const nameVariants = new Set<string>([qLower]);
    if (qLower.includes("ё")) nameVariants.add(qLower.replace(/ё/g, "е"));
    if (qLower.includes("е")) nameVariants.add(qLower.replace(/е/g, "ё"));
    const escape = (s: string) => s.replace(/[%_,()]/g, "\\$&");
    const ors: string[] = [];
    for (const v of nameVariants) ors.push(`full_name.ilike.%${escape(v)}%`);
    const escapedQ = escape(q);
    ors.push(`phone.ilike.%${escapedQ}%`, `phone_mobile.ilike.%${escapedQ}%`, `email.ilike.%${escapedQ}%`);
    query = query.or(ors.join(","));
  }
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ contacts: data ?? [] });
}

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
