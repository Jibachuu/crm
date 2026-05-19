import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET добавлен 19.05 для миграции «browser → VPS» (см. memory
// audit-2026-05-19). Раньше дропдауны в Create/EditLead/DealModal,
// ContractsClient, QuotesList и т.п. дёргали supabase.from("companies")
// напрямую — Supabase на AWS, российские провайдеры режут AWS-IP без
// VPN, поэтому компании не подгружались. Теперь все эти места
// проксируются через VPS.
//
// Параметры:
//   q       — фильтр по name/inn/brand (≥2 символа)
//   limit   — макс. кол-во (default 5000, чтобы за один запрос загрузить
//             весь каталог компаний для дропдауна)
//   offset  — пагинация
//   contact_id — компания(и) которые видят данный contact_id
//   ids     — список UUID через запятую (для batch-load)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "5000"), 1), 10000);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);
  const ids = searchParams.get("ids");
  const fields = searchParams.get("fields") || "id, name, inn, kpp, ogrn, legal_address, director, phone, email";

  const admin = createAdminClient();
  let query = admin.from("companies").select(fields).order("name");

  if (ids) {
    const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (idList.length > 0) query = query.in("id", idList);
  } else if (q.length >= 2) {
    const escape = (s: string) => s.replace(/[%_,()]/g, "\\$&");
    const escapedQ = escape(q);
    const digits = q.replace(/\D/g, "");
    const ors = [
      `name.ilike.%${escapedQ}%`,
      `brand_name.ilike.%${escapedQ}%`,
    ];
    if (digits.length >= 5) ors.push(`inn.ilike.%${digits}%`);
    query = query.or(ors.join(","));
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ companies: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const admin = createAdminClient();

  const insert: Record<string, unknown> = {
    name: body.name,
    created_by: user.id,
  };
  // Whitelist расширен 19.05.2026 для миграции browser→VPS (ColdCalls
  // и QuotesList создают компании со всеми этими полями).
  for (const f of [
    "inn", "kpp", "ogrn", "brand_name", "director",
    "phone", "email", "website", "legal_address", "actual_address",
    "city", "region", "description", "assigned_to", "company_type",
    "additional_phone_1", "additional_phone_2", "additional_phone_3",
    "additional_email_1", "additional_email_2", "additional_email_3",
  ]) {
    if (body[f] !== undefined) insert[f] = body[f] || null;
  }
  const { data, error } = await admin
    .from("companies")
    .insert(insert)
    .select("id, name, inn")
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
    "name", "brand_name", "inn", "ogrn", "kpp", "director", "city", "region",
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
