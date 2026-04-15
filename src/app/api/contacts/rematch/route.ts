import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function norm(s: string) { return (s || "").trim().toLowerCase().replace(/\s+/g, " "); }
function phoneSuffix(p: string) { return p.replace(/\D/g, "").slice(-10); }

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const results: string[] = [];

  // Load all contacts with lookup indexes
  const { data: allContacts } = await admin.from("contacts").select("id, full_name, phone, phone_mobile, email, telegram_id, telegram_username, maks_id");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactByPhone = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactByName = new Map<string, any[]>(); // name → [contacts]

  for (const c of allContacts ?? []) {
    if (c.phone) { const s = phoneSuffix(c.phone); if (s.length >= 7) contactByPhone.set(s, c); }
    if (c.phone_mobile) { const s = phoneSuffix(c.phone_mobile); if (s.length >= 7 && !contactByPhone.has(s)) contactByPhone.set(s, c); }
    // Index by name parts for fuzzy matching
    const n = norm(c.full_name);
    if (n.length >= 3) {
      if (!contactByName.has(n)) contactByName.set(n, []);
      contactByName.get(n)!.push(c);
    }
  }

  // Helper: extract person name from deal/lead title
  function extractName(title: string): string {
    // "Заявка с сайта Анна Митина "ЭСТЕТИКА МАНИКЮРА" Брянск" → "Анна Митина"
    // "МАКС: Полина Клиент" → "Полина Клиент"
    // "Telegram: Имя Фамилия" → "Имя Фамилия"
    let name = title;
    // Remove source prefix
    name = name.replace(/^(Заявка с сайта|МАКС|Telegram|Email|Звонок)\s*:?\s*/i, "");
    // Remove quoted company name
    name = name.replace(/["«»"][^"«»"]*["«»"]/g, "").trim();
    // Remove city-like suffixes
    name = name.replace(/\s+(г\.|город|Москва|Брянск|Казань|Екатеринбург|Новосибирск|Краснодар|Ростов|Воронеж|Самара|Уфа|Тюмень|Омск|Пермь|Волгоград|Красноярск|Саратов|Нижний|Санкт).*$/i, "").trim();
    return name;
  }

  // Helper: find best contact for a name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function findBestContact(name: string, currentContactId: string): any | null {
    const n = norm(name);
    if (n.length < 3) return null;

    // Exact name match
    const exact = contactByName.get(n);
    if (exact) {
      // Prefer contact with phone, not the current one
      const better = exact.find((c: { id: string; phone?: string }) => c.id !== currentContactId && c.phone);
      if (better) return better;
    }

    // Partial match: search all contacts for name containment
    for (const c of allContacts ?? []) {
      if (c.id === currentContactId) continue;
      if (!c.phone && !c.email) continue; // skip junk contacts
      const cn = norm(c.full_name);
      // Both directions: title name contains contact name, or contact name contains title name
      if (cn.length >= 3 && n.length >= 3 && (cn.includes(n) || n.includes(cn))) {
        return c;
      }
    }
    return null;
  }

  // ── Fix leads ──
  const { data: leads } = await admin.from("leads")
    .select("id, title, contact_id, contacts(id, full_name, phone, email)")
    .not("contact_id", "is", null);

  let leadsFixed = 0;
  for (const lead of leads ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contact = lead.contacts as any;
    if (!contact?.full_name || !lead.title) continue;

    const nameFromTitle = extractName(lead.title);
    if (!nameFromTitle || nameFromTitle.length < 3) continue;

    // Check if current contact name matches title
    const contactNorm = norm(contact.full_name);
    const titleNorm = norm(nameFromTitle);
    const isMatch = contactNorm.includes(titleNorm) || titleNorm.includes(contactNorm);
    if (isMatch) continue; // Current link is correct

    // Current contact doesn't match title — find better one
    const better = findBestContact(nameFromTitle, contact.id);
    if (better) {
      await admin.from("leads").update({ contact_id: better.id }).eq("id", lead.id);
      results.push(`Lead: "${lead.title}" — ${contact.full_name} → ${better.full_name}`);
      leadsFixed++;
    }
  }

  // ── Fix deals ──
  const { data: deals } = await admin.from("deals")
    .select("id, title, contact_id, contacts(id, full_name, phone, email)")
    .not("contact_id", "is", null);

  let dealsFixed = 0;
  for (const deal of deals ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contact = deal.contacts as any;
    if (!contact?.full_name || !deal.title) continue;

    const nameFromTitle = extractName(deal.title);
    if (!nameFromTitle || nameFromTitle.length < 3) continue;

    const contactNorm = norm(contact.full_name);
    const titleNorm = norm(nameFromTitle);
    const isMatch = contactNorm.includes(titleNorm) || titleNorm.includes(contactNorm);
    if (isMatch) continue;

    const better = findBestContact(nameFromTitle, contact.id);
    if (better) {
      await admin.from("deals").update({ contact_id: better.id }).eq("id", deal.id);
      results.push(`Deal: "${deal.title}" — ${contact.full_name} → ${better.full_name}`);
      dealsFixed++;
    }
  }

  // ── Merge duplicate contacts by phone ──
  let merged = 0;
  const phoneGroups = new Map<string, typeof allContacts>();
  for (const c of allContacts ?? []) {
    if (!c.phone) continue;
    const clean = phoneSuffix(c.phone);
    if (clean.length < 7) continue;
    if (!phoneGroups.has(clean)) phoneGroups.set(clean, []);
    phoneGroups.get(clean)!.push(c);
  }
  for (const [, group] of phoneGroups) {
    if (!group || group.length < 2) continue;
    const scored = group.map((c) => ({
      ...c,
      score: [c.full_name, c.phone, c.email, c.telegram_id, c.telegram_username, c.maks_id].filter(Boolean).length
        + (c.full_name && !/^\d+$/.test(c.full_name.trim()) ? 2 : 0),
    })).sort((a, b) => b.score - a.score);
    const keeper = scored[0];
    for (let i = 1; i < scored.length; i++) {
      const dup = scored[i];
      await admin.from("leads").update({ contact_id: keeper.id }).eq("contact_id", dup.id);
      await admin.from("deals").update({ contact_id: keeper.id }).eq("contact_id", dup.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upd: any = {};
      if (dup.email && !keeper.email) upd.email = dup.email;
      if (dup.telegram_id && !keeper.telegram_id) upd.telegram_id = dup.telegram_id;
      if (dup.telegram_username && !keeper.telegram_username) upd.telegram_username = dup.telegram_username;
      if (dup.maks_id && !keeper.maks_id) upd.maks_id = dup.maks_id;
      if (Object.keys(upd).length > 0) await admin.from("contacts").update(upd).eq("id", keeper.id);
      await admin.from("contacts").delete().eq("id", dup.id);
      merged++;
      results.push(`Merged: "${dup.full_name}" → "${keeper.full_name}"`);
    }
  }

  return NextResponse.json({
    ok: true,
    leads_fixed: leadsFixed,
    deals_fixed: dealsFixed,
    contacts_merged: merged,
    details: results.slice(0, 200),
  });
}
