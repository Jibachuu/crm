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

  const { data, error } = await admin
    .from("deals")
    .update({
      title: body.title,
      stage: body.stage,
      source: body.source || null,
      amount: body.amount != null ? Number(body.amount) : null,
      contact_id: body.contact_id || null,
      company_id: body.company_id || null,
      assigned_to: body.assigned_to || null,
      description: body.description || null,
      objections: body.objections || null,
    })
    .eq("id", body.id)
    .select(`*, contacts(id, full_name, phone, email), companies(id, name), users!deals_assigned_to_fkey(id, full_name)`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
