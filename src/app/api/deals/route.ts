import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();

  // Partial update: only touch fields that were explicitly provided.
  // Otherwise sending a partial body (e.g. just {id, amount}) used to wipe
  // contact_id/company_id because `body.x || null` couldn't tell "missing" from "cleared".
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.stage !== undefined) updates.stage = body.stage;
  if (body.source !== undefined) updates.source = body.source || null;
  if (body.amount !== undefined) updates.amount = body.amount != null ? Number(body.amount) : null;
  if (body.contact_id !== undefined) updates.contact_id = body.contact_id || null;
  if (body.company_id !== undefined) updates.company_id = body.company_id || null;
  if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to || null;
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.objections !== undefined) updates.objections = body.objections || null;

  const { data, error } = await admin
    .from("deals")
    .update(updates)
    .eq("id", body.id)
    .select(`*, contacts(id, full_name, phone, email), companies(id, name), users!deals_assigned_to_fkey(id, full_name)`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
