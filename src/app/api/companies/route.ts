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
