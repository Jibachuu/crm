import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { keepId, mergeIds } = await req.json();
  if (!keepId || !Array.isArray(mergeIds) || mergeIds.length === 0) {
    return NextResponse.json({ error: "keepId and mergeIds[] required" }, { status: 400 });
  }

  // Ensure keepId is not in mergeIds
  const ids = mergeIds.filter((id: string) => id !== keepId);
  if (ids.length === 0) {
    return NextResponse.json({ error: "mergeIds must contain IDs different from keepId" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Load keep contact and merge contacts
  const { data: keepContact } = await admin.from("contacts").select("*").eq("id", keepId).single();
  if (!keepContact) return NextResponse.json({ error: "Keep contact not found" }, { status: 404 });

  const { data: mergeContacts } = await admin.from("contacts").select("*").in("id", ids);
  if (!mergeContacts || mergeContacts.length === 0) {
    return NextResponse.json({ error: "Merge contacts not found" }, { status: 404 });
  }

  // 2. Copy non-null fields from merge contacts to keep contact (don't overwrite existing)
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
      if (mergeVal && !keepVal) {
        updates[field] = mergeVal;
      }
    }
  }

  // Apply updates to keep contact
  if (Object.keys(updates).length > 0) {
    await admin.from("contacts").update(updates).eq("id", keepId);
  }

  // 3. Reassign all related records from merge contacts to keep contact
  try {
    await admin.from("leads").update({ contact_id: keepId }).in("contact_id", ids);
    await admin.from("deals").update({ contact_id: keepId }).in("contact_id", ids);
    await admin.from("deal_contacts").update({ contact_id: keepId }).in("contact_id", ids);
    await admin.from("communications").update({ contact_id: keepId }).in("contact_id", ids);
    // Also update entity_type/entity_id references
    await admin.from("communications").update({ entity_id: keepId }).in("entity_id", ids).eq("entity_type", "contact");
    await admin.from("tasks").update({ entity_id: keepId }).in("entity_id", ids).eq("entity_type", "contact");
  } catch (e) {
    // deal_contacts might not exist, continue
    console.warn("[merge] reassign warning:", e);
  }

  // 4. Delete merge contacts
  await admin.from("contacts").delete().in("id", ids);

  return NextResponse.json({
    ok: true,
    merged: ids.length,
    updates,
  });
}
