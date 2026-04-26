import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SOFT_TABLES = ["leads", "deals", "contacts", "companies", "tasks"] as const;
type SoftTable = typeof SOFT_TABLES[number];

// Per-table SELECT shapes — keep payloads small and human-readable in /trash UI.
const SELECTS: Record<SoftTable, string> = {
  leads: "id, title, status, deleted_at, contacts(full_name), companies(name)",
  deals: "id, title, stage, amount, deleted_at, contacts(full_name), companies(name)",
  contacts: "id, full_name, phone, email, deleted_at, companies(name)",
  companies: "id, name, inn, phone, deleted_at",
  tasks: "id, title, status, due_date, deleted_at",
};

// GET /api/trash?table=leads&days=30 — admin/supervisor only
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const table = url.searchParams.get("table") as SoftTable | null;
  const days = Number(url.searchParams.get("days") ?? "30");

  if (!table || !SOFT_TABLES.includes(table)) {
    return NextResponse.json({ error: "table param required (leads/deals/contacts/companies/tasks)" }, { status: 400 });
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // SELECTS[table] is dynamic — Supabase generic typing can't infer the
  // resulting row shape, so we hand-type the rows below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin
    .from(table)
    .select(SELECTS[table]) as any)
    .not("deleted_at", "is", null)
    .gte("deleted_at", since)
    .order("deleted_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Look up "who deleted" via audit_log — most recent delete entry per row.
  const rows = (data ?? []) as Array<{ id: string }>;
  const ids = rows.map((r) => r.id);
  const actors: Record<string, { full_name?: string; deleted_at?: string }> = {};
  if (ids.length) {
    const { data: log } = await admin
      .from("audit_log")
      .select("row_id, actor_id, created_at, users:actor_id(full_name)")
      .eq("table_name", table)
      .eq("action", "delete")
      .in("row_id", ids)
      .order("created_at", { ascending: false });
    for (const entry of log ?? []) {
      const e = entry as { row_id: string; created_at: string; users?: { full_name?: string } | { full_name?: string }[] | null };
      if (actors[e.row_id]) continue; // keep newest only
      const u = Array.isArray(e.users) ? e.users[0] : e.users;
      actors[e.row_id] = { full_name: u?.full_name, deleted_at: e.created_at };
    }
  }

  return NextResponse.json({
    rows: rows.map((r) => ({ ...r, _actor: actors[r.id] ?? null })),
  });
}
