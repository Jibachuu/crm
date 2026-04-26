import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("companies")
    .insert({
      name: body.name,
      inn: body.inn || null,
      phone: body.phone || null,
      email: body.email || null,
      legal_address: body.legal_address || null,
      created_by: user.id,
    })
    .select("id, name")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// Partial update: only touch fields explicitly present in the body.
// Sending `{ id, assigned_to: null }` clears assigned_to without nuking
// every other column.
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};

  // Plain string/text/null fields
  for (const f of [
    "name", "inn", "ogrn", "kpp", "director", "city", "region",
    "legal_address", "actual_address", "delivery_address",
    "activity", "need", "company_type", "phone", "email", "website",
    "description", "assigned_to", "venue_type_id", "supplier_id",
    "opened_recently", "timezone", "contract_status", "contract_comment",
    "contract_file_url", "contract_file_name",
  ] as const) {
    if (body[f] !== undefined) updates[f] = body[f] || null;
  }

  // Numeric fields (allow explicit null/empty)
  for (const f of [
    "bathrooms_count", "rooms_count", "masters_count", "cabinets_count",
    "network_count", "avg_check",
  ] as const) {
    if (body[f] !== undefined) {
      updates[f] = body[f] === null || body[f] === "" ? null : Number(body[f]);
    }
  }

  if (body.is_network !== undefined) updates.is_network = !!body.is_network;
  if (body.contract_signed_at !== undefined) updates.contract_signed_at = body.contract_signed_at || null;
  if (body.addresses !== undefined) updates.addresses = body.addresses;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("companies")
    .update(updates)
    .eq("id", body.id)
    .select("*, users!companies_assigned_to_fkey(id, full_name), venue_types(id, name), suppliers(id, name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
