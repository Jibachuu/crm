import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTimezoneFromRegion } from "@/lib/timezone";
import Header from "@/components/layout/Header";
import TasksBoard from "./TasksBoard";

export const metadata: Metadata = { title: "Задачи" };

// Build a per-entity-type → id → title map so TasksBoard can label and
// link tasks correctly. Tasks pointing at a soft-deleted entity get
// rendered as "(удалена)" instead of a 404 link.
//
// Also builds entityTz: a parallel map of entity → IANA timezone string so
// task cards can render the local time / МСК-offset for clients in other
// regions (backlog v5 §1.6.2). leads/deals chain through their linked
// company to inherit the city/TZ.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildEntityIndex(admin: any, tasks: any[]) {
  const buckets = new Map<string, Set<string>>();
  for (const t of tasks) {
    if (!t.entity_type || !t.entity_id) continue;
    if (!buckets.has(t.entity_type)) buckets.set(t.entity_type, new Set());
    buckets.get(t.entity_type)!.add(t.entity_id);
  }

  const index: Record<string, Record<string, string>> = {};
  const entityTz: Record<string, Record<string, string>> = {};

  // Resolve a TZ from raw company-shaped fields (timezone overrides city,
  // both override the address) — same logic the company card uses.
  function resolveTz(c: { timezone?: string | null; city?: string | null; legal_address?: string | null; actual_address?: string | null } | null | undefined): string | null {
    if (!c) return null;
    if (c.timezone) return c.timezone;
    const fromCity = c.city ? getTimezoneFromRegion(c.city) : null;
    if (fromCity && fromCity !== "Europe/Moscow") return fromCity;
    const fromAddr = (c.legal_address || c.actual_address) ? getTimezoneFromRegion(c.legal_address || c.actual_address || "") : null;
    if (fromAddr && fromAddr !== "Europe/Moscow") return fromAddr;
    // If neither city nor address gave a non-MSK answer, fall back to
    // whichever did match (likely Europe/Moscow itself) or null when
    // there's nothing to go on.
    return c.timezone || fromCity || fromAddr || null;
  }

  // Companies are the canonical TZ source. Pull them in one shot for any
  // task that mentions a company directly OR via a linked lead/deal.
  // Two-phase: first companies referenced directly, then for leads/deals
  // we fetch their company_id and look up.
  const companyIdsDirect = Array.from(buckets.get("company") ?? []);
  const leadIds = Array.from(buckets.get("lead") ?? []);
  const dealIds = Array.from(buckets.get("deal") ?? []);
  const contactIds = Array.from(buckets.get("contact") ?? []);

  // Phase 1: leads and deals → fetch with their company_id so we can
  // resolve the company's TZ even though the task points at the lead/deal.
  let leadRows: { id: string; title: string; company_id?: string | null }[] = [];
  let dealRows: { id: string; title: string; company_id?: string | null }[] = [];
  let contactRows: { id: string; full_name: string; company_id?: string | null; city?: string | null }[] = [];

  if (leadIds.length > 0) {
    const { data } = await admin.from("leads")
      .select("id, title, company_id")
      .in("id", leadIds)
      .is("deleted_at", null);
    leadRows = data ?? [];
  }
  if (dealIds.length > 0) {
    const { data } = await admin.from("deals")
      .select("id, title, company_id")
      .in("id", dealIds)
      .is("deleted_at", null);
    dealRows = data ?? [];
  }
  if (contactIds.length > 0) {
    const { data } = await admin.from("contacts")
      .select("id, full_name, company_id, city")
      .in("id", contactIds)
      .is("deleted_at", null);
    contactRows = data ?? [];
  }

  // Collect all company IDs we need to resolve (direct + via lead + deal +
  // contact references).
  const allCompanyIds = new Set<string>([
    ...companyIdsDirect,
    ...leadRows.map((r) => r.company_id).filter((x): x is string => !!x),
    ...dealRows.map((r) => r.company_id).filter((x): x is string => !!x),
    ...contactRows.map((r) => r.company_id).filter((x): x is string => !!x),
  ]);

  let companyRows: { id: string; name: string; timezone: string | null; city: string | null; legal_address: string | null; actual_address: string | null }[] = [];
  if (allCompanyIds.size > 0) {
    const { data } = await admin.from("companies")
      .select("id, name, timezone, city, legal_address, actual_address")
      .in("id", Array.from(allCompanyIds))
      .is("deleted_at", null);
    companyRows = data ?? [];
  }

  const companyById = new Map(companyRows.map((c) => [c.id, c]));

  // Build the title index for each entity type.
  if (leadIds.length > 0) {
    index.lead = {};
    entityTz.lead = {};
    for (const r of leadRows) {
      index.lead[r.id] = r.title ?? "(без названия)";
      const tz = resolveTz(r.company_id ? companyById.get(r.company_id) ?? null : null);
      if (tz) entityTz.lead[r.id] = tz;
    }
  }
  if (dealIds.length > 0) {
    index.deal = {};
    entityTz.deal = {};
    for (const r of dealRows) {
      index.deal[r.id] = r.title ?? "(без названия)";
      const tz = resolveTz(r.company_id ? companyById.get(r.company_id) ?? null : null);
      if (tz) entityTz.deal[r.id] = tz;
    }
  }
  if (contactIds.length > 0) {
    index.contact = {};
    entityTz.contact = {};
    for (const r of contactRows) {
      index.contact[r.id] = r.full_name ?? "(без названия)";
      // Contact: try its own city first; chain to company if that flat-out
      // doesn't yield a non-MSK answer.
      const ownTz = r.city ? getTimezoneFromRegion(r.city) : null;
      const tz = (ownTz && ownTz !== "Europe/Moscow")
        ? ownTz
        : resolveTz(r.company_id ? companyById.get(r.company_id) ?? null : null) ?? ownTz;
      if (tz) entityTz.contact[r.id] = tz;
    }
  }
  if (companyIdsDirect.length > 0) {
    index.company = {};
    entityTz.company = {};
    for (const id of companyIdsDirect) {
      const c = companyById.get(id);
      index.company[id] = c?.name ?? "(без названия)";
      const tz = resolveTz(c ?? null);
      if (tz) entityTz.company[id] = tz;
    }
  }

  // sample doesn't carry a TZ — title only.
  if (buckets.has("sample")) {
    const { data } = await admin.from("samples")
      .select("id, venue_name")
      .in("id", Array.from(buckets.get("sample")!))
      .is("deleted_at", null);
    index.sample = {};
    for (const row of data ?? []) {
      index.sample[row.id] = row.venue_name ?? "(без названия)";
    }
  }

  return { index, entityTz };
}

export default async function TasksPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  const [{ data: tasks }, { data: currentProfile }, { data: users }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, users!tasks_assigned_to_fkey(full_name), creator:users!tasks_created_by_fkey(full_name)")
      .is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false }),
    authUser
      ? admin.from("users").select("id, role, full_name").eq("id", authUser.id).single()
      : Promise.resolve({ data: null }),
    admin.from("users").select("id, full_name, role").eq("is_active", true).order("full_name"),
  ]);

  const { index: entityIndex, entityTz } = await buildEntityIndex(admin, tasks ?? []);

  return (
    <>
      <Header title="Задачи" />
      <main className="p-6">
        <TasksBoard
          initialTasks={tasks ?? []}
          entityIndex={entityIndex}
          entityTz={entityTz}
          users={users ?? []}
          currentUser={currentProfile ?? null}
        />
      </main>
    </>
  );
}
