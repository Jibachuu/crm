import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Generic server-side list endpoint for the four big tables. Drives
// URL-state pagination/filtering on /leads /deals /contacts /companies
// without dragging the entire table into the browser.
//
// GET /api/list?table=leads
//   &page=1&per=50
//   &q=text                  full-text-ish ilike on name fields
//   &status=new              status enum (leads only)
//   &stage_id=<uuid>         funnel stage id (leads/deals)
//   &funnel_id=<uuid>        funnel id
//   &assigned_to=<uuid>      responsible user
//   &date_from=YYYY-MM-DD    created_at >= date_from
//   &date_to=YYYY-MM-DD      created_at <= date_to (end of day)
//
// Returns { rows, total, page, per }. Soft-deleted rows excluded for
// everyone (including admin) — the dedicated /trash page is the only
// place that surfaces them.

const ALLOWED = new Set(["leads", "deals", "contacts", "companies"]);

const SELECT_BY_TABLE: Record<string, string> = {
  leads:    "*, contacts(id, full_name, phone), companies(id, name), users!leads_assigned_to_fkey(id, full_name)",
  deals:    "*, contacts(id, full_name), companies(id, name), users!deals_assigned_to_fkey(id, full_name)",
  contacts: "*, companies(id, name), users!contacts_assigned_to_fkey(id, full_name)",
  companies: "*, users!companies_assigned_to_fkey(id, full_name)",
};

const SEARCH_FIELDS: Record<string, string[]> = {
  leads:    ["title"],
  deals:    ["title"],
  contacts: ["full_name", "phone", "email"],
  companies: ["name", "inn", "phone", "email"],
};

const DEFAULT_ORDER: Record<string, { column: string; ascending: boolean }> = {
  leads: { column: "created_at", ascending: false },
  deals: { column: "created_at", ascending: false },
  contacts: { column: "created_at", ascending: false },
  companies: { column: "name", ascending: true },
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const table = (searchParams.get("table") || "").toLowerCase();
  if (!ALLOWED.has(table)) return NextResponse.json({ error: "Invalid table" }, { status: 400 });

  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const per = Math.min(200, Math.max(1, Number(searchParams.get("per") || "50")));
  const q = (searchParams.get("q") || "").trim();
  const status = searchParams.get("status");
  const stageId = searchParams.get("stage_id");
  const funnelId = searchParams.get("funnel_id");
  const assignedTo = searchParams.get("assigned_to");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  const admin = createAdminClient();
  const order = DEFAULT_ORDER[table];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = admin
    .from(table)
    .select(SELECT_BY_TABLE[table], { count: "exact" })
    .is("deleted_at", null);

  if (q && SEARCH_FIELDS[table]?.length) {
    const ors = SEARCH_FIELDS[table].map((f) => `${f}.ilike.%${q}%`);
    query = query.or(ors.join(","));
  }
  if (status && (table === "leads")) query = query.eq("status", status);
  if (stageId && (table === "leads" || table === "deals")) query = query.eq("stage_id", stageId);
  if (funnelId && (table === "leads" || table === "deals")) query = query.eq("funnel_id", funnelId);
  if (assignedTo) query = query.eq("assigned_to", assignedTo);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59");

  const from = (page - 1) * per;
  const to = from + per - 1;
  query = query.order(order.column, { ascending: order.ascending }).range(from, to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [], total: count ?? 0, page, per });
}
