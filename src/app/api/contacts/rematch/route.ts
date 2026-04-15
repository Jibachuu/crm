import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Re-match deals and leads to correct contacts by phone/email
// Fixes cases where "Анна" was matched to wrong contact
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const results: string[] = [];

  // 1. Build contact lookup by phone/email/messenger IDs
  const { data: allContacts } = await admin.from("contacts").select("id, full_name, phone, phone_mobile, email, telegram_id, telegram_username, maks_id");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactByPhone = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactByEmail = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactByTgId = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactByMaksId = new Map<string, any>();

  for (const c of allContacts ?? []) {
    if (c.phone) {
      const clean = c.phone.replace(/\D/g, "").slice(-10);
      if (clean.length >= 7) contactByPhone.set(clean, c);
    }
    if (c.phone_mobile) {
      const clean = c.phone_mobile.replace(/\D/g, "").slice(-10);
      if (clean.length >= 7) contactByPhone.set(clean, c);
    }
    if (c.email) contactByEmail.set(c.email.toLowerCase(), c);
    if (c.telegram_id) contactByTgId.set(c.telegram_id, c);
    if (c.maks_id) contactByMaksId.set(c.maks_id, c);
  }

  // 2. Check all leads — find better contact match by messenger ID, phone, or name
  const { data: leads } = await admin.from("leads")
    .select("id, title, contact_id, contacts(id, full_name, phone, email, telegram_id, maks_id)")
    .not("contact_id", "is", null);

  let leadsFixed = 0;
  for (const lead of leads ?? []) {
    const contact = lead.contacts as unknown as { id: string; full_name: string; phone?: string; email?: string; telegram_id?: string; maks_id?: string } | null;
    if (!contact) continue;

    // Skip if contact already has phone/email AND messenger IDs — probably correct
    if ((contact.phone || contact.email) && (contact.telegram_id || contact.maks_id)) continue;

    // Try to find a better match
    const titleMatch = lead.title?.match(/:\s*(.+)/);
    const nameFromTitle = titleMatch?.[1]?.trim();
    if (!nameFromTitle) continue;

    // Search by messenger ID first, then by name+phone
    let betterContact = null;

    // If current contact has telegram_id, find if there's a BETTER contact with same tg_id + phone
    if (contact.telegram_id) {
      const match = contactByTgId.get(contact.telegram_id);
      if (match && match.id !== contact.id) betterContact = match;
    }
    if (!betterContact && contact.maks_id) {
      const match = contactByMaksId.get(contact.maks_id);
      if (match && match.id !== contact.id) betterContact = match;
    }

    // If no messenger match, try name match to a contact WITH phone
    if (!betterContact && !contact.phone) {
      const { data: betterContacts } = await admin.from("contacts")
        .select("id, full_name, phone, email")
        .ilike("full_name", `%${nameFromTitle}%`)
        .not("phone", "is", null)
        .limit(1);
      if (betterContacts?.[0]) betterContact = betterContacts[0];
    }

    if (betterContact) {
      await admin.from("leads").update({ contact_id: betterContact.id }).eq("id", lead.id);
      results.push(`Lead "${lead.title}": ${contact.full_name} → ${betterContact.full_name} (${betterContact.phone})`);
      leadsFixed++;
    }
  }

  // 3. Same for deals
  const { data: deals } = await admin.from("deals")
    .select("id, title, contact_id, contacts(id, full_name, phone, email, telegram_id, maks_id)")
    .not("contact_id", "is", null);

  let dealsFixed = 0;
  for (const deal of deals ?? []) {
    const contact = deal.contacts as unknown as { id: string; full_name: string; phone?: string; email?: string; telegram_id?: string; maks_id?: string } | null;
    if (!contact) continue;
    if ((contact.phone || contact.email) && (contact.telegram_id || contact.maks_id)) continue;

    const titleMatch = deal.title?.match(/:\s*(.+)/);
    const nameFromTitle = titleMatch?.[1]?.trim();
    if (!nameFromTitle) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let betterContact: any = null;
    if (contact.telegram_id) {
      const match = contactByTgId.get(contact.telegram_id);
      if (match && match.id !== contact.id) betterContact = match;
    }
    if (!betterContact && contact.maks_id) {
      const match = contactByMaksId.get(contact.maks_id);
      if (match && match.id !== contact.id) betterContact = match;
    }
    if (!betterContact && !contact.phone) {
      const { data: found } = await admin.from("contacts")
        .select("id, full_name, phone, email")
        .ilike("full_name", `%${nameFromTitle}%`)
        .not("phone", "is", null)
        .limit(1);
      if (found?.[0]) betterContact = found[0];
    }

    if (betterContact) {
      await admin.from("deals").update({ contact_id: betterContact.id }).eq("id", deal.id);
      results.push(`Deal "${deal.title}": ${contact.full_name} → ${betterContact.full_name} (${betterContact.phone})`);
      dealsFixed++;
    }
  }

  // 4. Merge duplicate contacts: if same phone exists on 2+ contacts, keep the one with more data
  let merged = 0;
  const phoneGroups = new Map<string, typeof allContacts>();
  for (const c of allContacts ?? []) {
    if (!c.phone) continue;
    const clean = c.phone.replace(/\D/g, "").slice(-10);
    if (clean.length < 7) continue;
    if (!phoneGroups.has(clean)) phoneGroups.set(clean, []);
    phoneGroups.get(clean)!.push(c);
  }

  for (const [, group] of phoneGroups) {
    if (!group || group.length < 2) continue;
    // Score each contact: more fields filled = higher score
    const scored = group.map((c) => ({
      ...c,
      score: [c.full_name, c.phone, c.email, c.telegram_id, c.telegram_username, c.maks_id].filter(Boolean).length,
    })).sort((a, b) => b.score - a.score);

    const keeper = scored[0];
    for (let i = 1; i < scored.length; i++) {
      const dup = scored[i];
      // Move leads/deals from duplicate to keeper
      await admin.from("leads").update({ contact_id: keeper.id }).eq("contact_id", dup.id);
      await admin.from("deals").update({ contact_id: keeper.id }).eq("contact_id", dup.id);
      // Enrich keeper with dup's data
      const updates: Record<string, string> = {};
      if (dup.email && !keeper.email) updates.email = dup.email;
      if (dup.telegram_id && !keeper.telegram_id) updates.telegram_id = dup.telegram_id;
      if (dup.telegram_username && !keeper.telegram_username) updates.telegram_username = dup.telegram_username;
      if (dup.maks_id && !keeper.maks_id) updates.maks_id = dup.maks_id;
      if (Object.keys(updates).length > 0) await admin.from("contacts").update(updates).eq("id", keeper.id);
      // Delete duplicate
      await admin.from("contacts").delete().eq("id", dup.id);
      merged++;
      results.push(`Merged: "${dup.full_name}" → "${keeper.full_name}" (${keeper.phone})`);
    }
  }

  return NextResponse.json({
    ok: true,
    leads_fixed: leadsFixed,
    deals_fixed: dealsFixed,
    contacts_merged: merged,
    details: results.slice(0, 100),
  });
}
