import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// supplier_settings — singleton (одна запись на CRM). GET читает первую,
// POST создаёт, PUT обновляет. Этап 3 миграции browser→VPS.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin.from("supplier_settings").select("*").limit(1).maybeSingle();
  return NextResponse.json({ supplier: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const admin = createAdminClient();
  // Не whitelistим вручную — supplier_settings уже доверенная зона
  // (только админ редактирует), но фильтруем id чтобы не было PK-конфликта.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = body;
  const { data, error } = await admin.from("supplier_settings").insert(rest).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = createAdminClient();
  const { id, ...updates } = body;
  const { data, error } = await admin.from("supplier_settings").update(updates).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
