import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// /api/addresses — N addresses per company (backlog v5 §3).
// Avoids the historical bug where adding a delivery address to a deal
// silently overwrote whatever was already in companies.delivery_address.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("addresses")
    .select("*")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ addresses: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.company_id || !body.address) {
    return NextResponse.json({ error: "company_id and address required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const kind = ["legal", "delivery", "office", "other"].includes(body.kind) ? body.kind : "delivery";

  // If the new row is marked default, demote any previous default of the
  // same kind so we keep at most one default per (company, kind).
  if (body.is_default) {
    await admin.from("addresses").update({ is_default: false })
      .eq("company_id", body.company_id).eq("kind", kind);
  }

  const { data, error } = await admin
    .from("addresses")
    .insert({
      company_id: body.company_id,
      address: body.address,
      kind,
      is_default: !!body.is_default,
      notes: body.notes ?? null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ address: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.address !== undefined) updates.address = body.address;
  if (body.kind !== undefined) updates.kind = body.kind;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.is_default !== undefined) updates.is_default = !!body.is_default;
  updates.updated_at = new Date().toISOString();

  const admin = createAdminClient();
  // Keep "at most one default per (company, kind)".
  if (body.is_default) {
    const { data: existing } = await admin.from("addresses").select("company_id, kind").eq("id", body.id).single();
    if (existing) {
      await admin.from("addresses").update({ is_default: false })
        .eq("company_id", existing.company_id).eq("kind", existing.kind).neq("id", body.id);
    }
  }

  const { data, error } = await admin.from("addresses").update(updates).eq("id", body.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ address: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("addresses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
