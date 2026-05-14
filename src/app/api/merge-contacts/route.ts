import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Find all contacts grouped by phone (last 10 digits)
  const { data: contacts } = await admin.from("contacts").select("id, full_name, phone, email, telegram_id, telegram_username, maks_id, company_id, created_at").not("phone", "is", null);

  if (!contacts) return NextResponse.json({ error: "No contacts" }, { status: 500 });

  // Group by normalized phone
  const groups = new Map<string, typeof contacts>();
  for (const c of contacts) {
    const phone = c.phone?.replace(/\D/g, "").slice(-10);
    if (!phone || phone.length < 7) continue;
    if (!groups.has(phone)) groups.set(phone, []);
    groups.get(phone)!.push(c);
  }

  let merged = 0;
  const errors: string[] = [];

  for (const [phone, group] of groups) {
    if (group.length < 2) continue;

    // Sort by created_at, keep oldest as primary
    group.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    const primary = group[0];
    const duplicates = group.slice(1);

    // Merge data into primary. Only adopt the duplicate's full_name when
    // the primary's is genuinely junk (empty / all digits). Length is a
    // bad proxy for "more complete" and the heuristic was clobbering
    // hand-typed names with auto-generated longer ones (backlog v6 §2.10).
    const isJunkName = (n: string | null | undefined) =>
      !n || /^\d+$/.test(String(n).trim()) || String(n).trim().length < 2;
    const updates: Record<string, unknown> = {};
    for (const dup of duplicates) {
      if (dup.full_name && isJunkName(primary.full_name) && !isJunkName(dup.full_name)) {
        updates.full_name = dup.full_name;
        primary.full_name = dup.full_name;
      }
      if (dup.email && !primary.email) { updates.email = dup.email; primary.email = dup.email; }
      if (dup.telegram_id && !primary.telegram_id) { updates.telegram_id = dup.telegram_id; primary.telegram_id = dup.telegram_id; }
      if (dup.telegram_username && !primary.telegram_username) { updates.telegram_username = dup.telegram_username; primary.telegram_username = dup.telegram_username; }
      if (dup.maks_id && !primary.maks_id) { updates.maks_id = dup.maks_id; primary.maks_id = dup.maks_id; }
      if (dup.company_id && !primary.company_id) { updates.company_id = dup.company_id; primary.company_id = dup.company_id; }
    }

    // Apply updates to primary
    if (Object.keys(updates).length > 0) {
      await admin.from("contacts").update(updates).eq("id", primary.id);
    }

    // Reassign all references from duplicates to primary
    const dupIds = duplicates.map((d) => d.id);
    try {
      await admin.from("leads").update({ contact_id: primary.id }).in("contact_id", dupIds);
      await admin.from("deals").update({ contact_id: primary.id }).in("contact_id", dupIds);
      await admin.from("communications").update({ contact_id: primary.id }).in("contact_id", dupIds);
      await admin.from("tasks").update({ entity_id: primary.id }).in("entity_id", dupIds).eq("entity_type", "contact");

      // Junction tables — strip duplicates first to avoid UNIQUE violation.
      for (const tbl of [
        { table: "deal_contacts" as const, parent: "deal_id" as const },
        { table: "lead_contacts" as const, parent: "lead_id" as const },
      ]) {
        try {
          const { data: keepLinks } = await admin.from(tbl.table).select(tbl.parent).eq("contact_id", primary.id);
          const keepParents: string[] = (keepLinks ?? []).map((r: Record<string, string>) => r[tbl.parent]);
          if (keepParents.length > 0) {
            const { data: dupes } = await admin
              .from(tbl.table)
              .select(`id, ${tbl.parent}`)
              .in("contact_id", dupIds)
              .in(tbl.parent, keepParents);
            const dupeRowIds: string[] = (dupes ?? []).map((d: { id: string }) => d.id);
            if (dupeRowIds.length > 0) await admin.from(tbl.table).delete().in("id", dupeRowIds);
          }
          await admin.from(tbl.table).update({ contact_id: primary.id }).in("contact_id", dupIds);
        } catch (e) {
          // lead_contacts may not exist on prod yet (migration_v66) — ignore.
          console.warn(`[merge-contacts] ${tbl.table} reassign skipped:`, e);
        }
      }

      // Soft delete duplicates so we can audit/restore.
      const now = new Date().toISOString();
      await admin.from("contacts").update({ deleted_at: now }).in("id", dupIds);
      try {
        await admin.from("audit_log").insert(
          dupIds.map((id) => ({
            table_name: "contacts",
            row_id: id,
            action: "delete",
            actor_id: user.id,
            payload: { source: "api/merge-contacts", primaryId: primary.id, phone },
          }))
        );
      } catch (e) {
        console.warn("[audit_log merge-contacts]", e);
      }
      merged += duplicates.length;
    } catch (e) {
      errors.push(`phone ${phone}: ${e}`);
    }
  }

  // Bonus: clean up junk names — replace digit-only/empty names with phone/email/username
  try {
    const { data: junk } = await admin
      .from("contacts")
      .select("id, full_name, phone, email, telegram_username")
      .or("full_name.is.null,full_name.eq.")
      .limit(500);
    const { data: junk2 } = await admin
      .from("contacts")
      .select("id, full_name, phone, email, telegram_username");
    const allJunk = [...(junk ?? []), ...((junk2 ?? []).filter((c) => c.full_name && /^\d+$/.test(c.full_name)))];
    let renamed = 0;
    for (const c of allJunk) {
      const name = c.telegram_username || c.phone || c.email;
      if (name && name !== c.full_name) {
        await admin.from("contacts").update({ full_name: name }).eq("id", c.id);
        renamed++;
      }
    }
    return NextResponse.json({ ok: true, merged, groups: groups.size, errors, renamed });
  } catch {
    return NextResponse.json({ ok: true, merged, groups: groups.size, errors });
  }
}
