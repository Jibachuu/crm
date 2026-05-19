import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// CRUD custom_fields + custom_field_values. Этап 3 миграции browser→VPS.
//
// GET /api/custom-fields?entity_type=deal           → схема полей
// GET /api/custom-fields?entity_type=deal&entity_id=X → схема + значения
// POST                                              → создать поле
// PUT                                               → обновить поле
// DELETE ?id=X                                      → удалить поле
//
// Для значений отдельный under-path:
// POST /api/custom-fields?action=upsert_value      → UPSERT в custom_field_values

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entity_type");
  const entityId = searchParams.get("entity_id");

  const admin = createAdminClient();
  let fieldsQuery = admin.from("custom_fields").select("*").order("sort_order").order("name");
  if (entityType) fieldsQuery = fieldsQuery.eq("entity_type", entityType);
  const { data: fields, error } = await fieldsQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let values: unknown[] = [];
  if (entityType && entityId) {
    const { data: vals } = await admin.from("custom_field_values")
      .select("*").eq("entity_type", entityType).eq("entity_id", entityId);
    values = vals ?? [];
  }

  return NextResponse.json({ fields: fields ?? [], values });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const admin = createAdminClient();

  // UPSERT значения. Реальная схема — split-columns value_text/number/date/boolean.
  if (body.action === "upsert_value") {
    if (!body.field_id || !body.entity_type || !body.entity_id) {
      return NextResponse.json({ error: "field_id/entity_type/entity_id required" }, { status: 400 });
    }
    const upsertRow: Record<string, unknown> = {
      field_id: body.field_id,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      value_text: body.value_text ?? null,
      value_number: body.value_number ?? null,
      value_date: body.value_date ?? null,
      value_boolean: body.value_boolean ?? null,
    };
    const { data, error } = await admin.from("custom_field_values")
      .upsert(upsertRow, { onConflict: "field_id,entity_id" })
      .select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  }

  // Создать поле
  const { data, error } = await admin.from("custom_fields").insert({
    name: body.name,
    entity_type: body.entity_type,
    field_type: body.field_type || "text",
    options: body.options || null,
    sort_order: body.sort_order ?? 0,
    created_by: user.id,
  }).select("*").single();
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
  const updates: Record<string, unknown> = {};
  for (const f of ["name", "entity_type", "field_type", "options", "sort_order"]) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  const { data, error } = await admin.from("custom_fields").update(updates).eq("id", body.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = createAdminClient();
  // Каскад: сначала чистим значения, потом само поле
  await admin.from("custom_field_values").delete().eq("field_id", id);
  await admin.from("custom_fields").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
