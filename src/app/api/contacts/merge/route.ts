import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Reassign junction-table rows from a set of "from" contact ids onto a single
// "keep" contact id, deleting duplicates that would violate the
// (parent_id, contact_id) UNIQUE constraint.
//
// Without this step the bulk UPDATE below fails with 23505 (unique violation)
// the moment the same parent (deal/lead) is linked to both a "from" contact
// and the "keep" contact — and the silent catch in the original code masked
// the failure, leaving link state half-merged.
async function reassignJunction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  table: "deal_contacts" | "lead_contacts",
  parentCol: "deal_id" | "lead_id",
  keepId: string,
  fromIds: string[]
) {
  const { data: keepLinks } = await admin.from(table).select(parentCol).eq("contact_id", keepId);
  const keepParents: string[] = (keepLinks ?? []).map((r: Record<string, string>) => r[parentCol]);

  if (keepParents.length > 0) {
    const { data: dupes } = await admin
      .from(table)
      .select(`id, ${parentCol}`)
      .in("contact_id", fromIds)
      .in(parentCol, keepParents);
    const dupeIds: string[] = (dupes ?? []).map((d: { id: string }) => d.id);
    if (dupeIds.length > 0) await admin.from(table).delete().in("id", dupeIds);
  }

  await admin.from(table).update({ contact_id: keepId }).in("contact_id", fromIds);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { keepId, mergeIds } = await req.json();
  if (!keepId || !Array.isArray(mergeIds) || mergeIds.length === 0) {
    return NextResponse.json({ error: "keepId and mergeIds[] required" }, { status: 400 });
  }

  const ids = mergeIds.filter((id: string) => id !== keepId);
  if (ids.length === 0) {
    return NextResponse.json({ error: "mergeIds must contain IDs different from keepId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: keepContact } = await admin.from("contacts").select("*").eq("id", keepId).single();
  if (!keepContact) return NextResponse.json({ error: "Keep contact not found" }, { status: 404 });

  const { data: mergeContacts } = await admin.from("contacts").select("*").in("id", ids);
  if (!mergeContacts || mergeContacts.length === 0) {
    return NextResponse.json({ error: "Merge contacts not found" }, { status: 404 });
  }

  // Copy non-null fields from merge contacts to keep contact (don't overwrite existing)
  const fieldsToCopy = [
    "full_name", "first_name", "last_name", "middle_name", "position",
    "phone", "phone_mobile", "phone_other",
    "email", "email_other",
    "telegram_id", "telegram_username", "maks_id",
    "company_id", "description", "city", "region",
  ];

  const updates: Record<string, unknown> = {};
  for (const mc of mergeContacts) {
    for (const field of fieldsToCopy) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mergeVal = (mc as any)[field];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keepVal = (keepContact as any)[field] ?? updates[field];
      if (mergeVal && !keepVal) updates[field] = mergeVal;
    }
  }
  if (Object.keys(updates).length > 0) {
    await admin.from("contacts").update(updates).eq("id", keepId);
  }

  // Reassign single-FK references — these have no UNIQUE constraint, so
  // a straight bulk UPDATE is safe.
  await admin.from("leads").update({ contact_id: keepId }).in("contact_id", ids);
  await admin.from("deals").update({ contact_id: keepId }).in("contact_id", ids);
  await admin.from("communications").update({ contact_id: keepId }).in("contact_id", ids);
  await admin.from("communications").update({ entity_id: keepId }).in("entity_id", ids).eq("entity_type", "contact");
  await admin.from("tasks").update({ entity_id: keepId }).in("entity_id", ids).eq("entity_type", "contact");

  // Reassign junction tables — strip duplicates first to avoid UNIQUE
  // violation (deal_id/lead_id, contact_id).
  await reassignJunction(admin, "deal_contacts", "deal_id", keepId, ids);
  // lead_contacts may not yet exist on prod (migration_v66); ignore failure.
  try {
    await reassignJunction(admin, "lead_contacts", "lead_id", keepId, ids);
  } catch (e) {
    console.warn("[merge] lead_contacts reassign skipped:", e);
  }

  // Soft delete the merged-away contacts so we can audit/restore if the merge was wrong.
  const now = new Date().toISOString();
  await admin.from("contacts").update({ deleted_at: now }).in("id", ids);

  try {
    await admin.from("audit_log").insert(
      ids.map((id: string) => ({
        table_name: "contacts",
        row_id: id,
        action: "delete",
        actor_id: user.id,
        payload: { source: "api/contacts/merge", keepId },
      }))
    );
  } catch (e) {
    console.warn("[audit_log merge]", e);
  }

  return NextResponse.json({ ok: true, merged: ids.length, updates });
}
