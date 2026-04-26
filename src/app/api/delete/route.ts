import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Tables that support soft delete (have deleted_at column from migration_v67).
const SOFT_TABLES = ["leads", "deals", "contacts", "companies", "tasks"] as const;
// Tables we still hard-delete from (no soft-delete need).
const HARD_TABLES = ["products", "samples"] as const;

const ALLOWED_TABLES = [...SOFT_TABLES, ...HARD_TABLES] as const;
type AllowedTable = typeof ALLOWED_TABLES[number];

const CHUNK = 50;
function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// POST: soft-delete by default. Pass {force: true} to hard-delete (admin only).
// Every delete is recorded in audit_log so we can see who did what.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const table = body.table as AllowedTable;
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const force: boolean = !!body.force;

  if (!ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Authz check: hard delete (and any delete from HARD_TABLES) requires admin role.
  const requiresAdmin = force || (HARD_TABLES as readonly string[]).includes(table);
  if (requiresAdmin) {
    const { data: profile } = await admin.from("users").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Только админ может выполнить безвозвратное удаление" }, { status: 403 });
    }
  }

  try {
    const isSoft = (SOFT_TABLES as readonly string[]).includes(table) && !force;
    const action = isSoft ? "delete" : "hard_delete";

    if (isSoft) {
      // Soft delete: stamp deleted_at. Does NOT touch FKs — restore must
      // bring entity back exactly as it was. RLS hides the row from
      // non-admin users so the UI behaves as if it's gone.
      const now = new Date().toISOString();
      for (const chunk of chunks(ids, CHUNK)) {
        const { error } = await admin.from(table).update({ deleted_at: now }).in("id", chunk);
        if (error) {
          console.error("[soft-delete]", table, error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    } else {
      // Hard delete path (admin-only). Nullify FKs first to satisfy ON
      // DELETE SET NULL semantics explicitly (avoids trigger ordering bugs)
      // and to remove dependents that have CASCADE.
      for (const chunk of chunks(ids, CHUNK)) {
        if (table === "companies") {
          await admin.from("contacts").update({ company_id: null }).in("company_id", chunk);
          await admin.from("leads").update({ company_id: null }).in("company_id", chunk);
          await admin.from("deals").update({ company_id: null }).in("company_id", chunk);
        }
        if (table === "contacts") {
          await admin.from("leads").update({ contact_id: null }).in("contact_id", chunk);
          await admin.from("deals").update({ contact_id: null }).in("contact_id", chunk);
        }
        if (table === "products") {
          await admin.from("deal_products").delete().in("product_id", chunk);
          await admin.from("lead_products").delete().in("product_id", chunk);
        }
      }
      for (const chunk of chunks(ids, CHUNK)) {
        const { error } = await admin.from(table).delete().in("id", chunk);
        if (error) {
          console.error("[hard-delete]", table, error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    }

    // Audit log — best-effort, do not fail the request if logging breaks.
    try {
      const rows = ids.map((id) => ({
        table_name: table,
        row_id: id,
        action,
        actor_id: user.id,
        payload: { source: "api/delete" },
      }));
      await admin.from("audit_log").insert(rows);
    } catch (e) {
      console.warn("[audit_log]", e);
    }

    return NextResponse.json({ ok: true, action, count: ids.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[delete]", table, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
