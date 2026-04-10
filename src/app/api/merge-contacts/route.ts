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

    // Merge data into primary
    const updates: Record<string, unknown> = {};
    for (const dup of duplicates) {
      if (dup.full_name && (!primary.full_name || /^\d+$/.test(primary.full_name) || primary.full_name.length < (dup.full_name?.length ?? 0))) {
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

      // Delete duplicates
      await admin.from("contacts").delete().in("id", dupIds);
      merged += duplicates.length;
    } catch (e) {
      errors.push(`phone ${phone}: ${e}`);
    }
  }

  return NextResponse.json({ ok: true, merged, groups: groups.size, errors });
}
