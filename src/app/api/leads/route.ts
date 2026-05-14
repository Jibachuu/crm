import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Create a new lead. Bypasses RLS so we can attribute the row to whoever
// triggered the request (e.g. site form falls back to no auth → 401).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const admin = createAdminClient();

  const insert: Record<string, unknown> = {
    title: body.title,
    status: body.status || "new",
    source: body.source || null,
    contact_id: body.contact_id || null,
    company_id: body.company_id || null,
    assigned_to: body.assigned_to || null,
    description: body.description || null,
    telegram_username: body.telegram_username || null,
    funnel_id: body.funnel_id || null,
    stage_id: body.stage_id || null,
    created_by: user.id,
  };

  const { data, error } = await admin
    .from("leads")
    .insert(insert)
    .select("*, contacts(id, full_name, phone, email), companies(id, name), users!leads_assigned_to_fkey(id, full_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Backlog v6 §2.7 — mirror company onto the new lead's contact too.
  if (insert.contact_id && insert.company_id) {
    const { data: c } = await admin.from("contacts").select("company_id").eq("id", insert.contact_id).single();
    if (c && !c.company_id) {
      await admin.from("contacts").update({ company_id: insert.company_id }).eq("id", insert.contact_id);
    }
  }

  return NextResponse.json(data);
}

// Partial update — same pattern as /api/deals: only touch fields the caller
// explicitly sent, so `{ id, status: "in_progress" }` doesn't wipe contact_id.
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) updates.title = body.title;
  if (body.status !== undefined) updates.status = body.status;
  if (body.source !== undefined) updates.source = body.source || null;
  if (body.contact_id !== undefined) updates.contact_id = body.contact_id || null;
  if (body.company_id !== undefined) updates.company_id = body.company_id || null;
  if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to || null;
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.telegram_username !== undefined) updates.telegram_username = body.telegram_username || null;
  if (body.funnel_id !== undefined) updates.funnel_id = body.funnel_id || null;
  if (body.stage_id !== undefined) updates.stage_id = body.stage_id || null;
  if (body.stage_changed_at !== undefined) updates.stage_changed_at = body.stage_changed_at;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("leads")
    .update(updates)
    .eq("id", body.id)
    .select("*, contacts(id, full_name, phone, email), companies(id, name), users!leads_assigned_to_fkey(id, full_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Backlog v6 §2.7 — mirror company onto the contact when the lead links
  // both, so the contact's card stops showing «без компании». Same
  // null-safety as /api/deals (don't override an existing different
  // company; operator has to do that explicitly).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  if (d?.contact_id && d?.company_id) {
    const { data: c } = await admin.from("contacts").select("company_id").eq("id", d.contact_id).single();
    if (c && !c.company_id) {
      await admin.from("contacts").update({ company_id: d.company_id }).eq("id", d.contact_id);
    }
  }

  return NextResponse.json(data);
}
