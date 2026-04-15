import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Full messenger sync: collect IDs from TG/MAX, match to CRM contacts, write messenger IDs back
// This is the "WhatsApp approach" — messenger IDs become the primary link
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const results: string[] = [];

  // ── Step 1: Collect all messenger profiles ──
  interface MessengerProfile { tg_id?: string; tg_username?: string; maks_id?: string; phone?: string; name?: string }
  const profiles: MessengerProfile[] = [];

  // Telegram dialogs
  try {
    const { tgProxy } = await import("@/lib/telegram/proxy");
    const dialogsData = await tgProxy<{ dialogs: Array<{ id: string; name: string; username: string | null; phone: string | null; isUser: boolean }> }>("/dialogs");
    for (const d of dialogsData.dialogs ?? []) {
      if (!d.isUser) continue;
      profiles.push({
        tg_id: String(d.id),
        tg_username: d.username || undefined,
        phone: d.phone ? String(d.phone) : undefined,
        name: d.name || undefined,
      });
    }
    results.push(`TG: loaded ${profiles.length} dialogs`);
  } catch (e) {
    results.push(`TG error: ${String(e).slice(0, 100)}`);
  }

  // MAX chats
  const maxStart = profiles.length;
  try {
    const maxProxy = process.env.MAX_PROXY_URL;
    const maxKey = process.env.MAX_PROXY_KEY;
    if (maxProxy && maxKey) {
      const res = await fetch(`${maxProxy}/chats`, { headers: { Authorization: maxKey } });
      if (res.ok) {
        const data = await res.json();
        for (const c of data.chats ?? []) {
          const chatId = String(c.chatId ?? c.id ?? "");
          if (!chatId || Number(chatId) < 0) continue;
          const chatPhone = c.phone ? String(c.phone) : undefined;
          const chatName = c.title && !/^\d+$/.test(c.title.trim()) && c.title.trim().length >= 2 ? c.title : undefined;

          // Find existing TG profile with same phone and merge
          const existing = chatPhone ? profiles.find((p) => p.phone && p.phone.replace(/\D/g, "").slice(-10) === chatPhone.replace(/\D/g, "").slice(-10)) : null;
          if (existing) {
            existing.maks_id = chatId;
            if (chatName && !existing.name) existing.name = chatName;
          } else {
            profiles.push({ maks_id: chatId, phone: chatPhone, name: chatName });
          }
        }
        results.push(`MAX: loaded ${profiles.length - maxStart} chats`);
      }
    }
  } catch (e) {
    results.push(`MAX error: ${String(e).slice(0, 100)}`);
  }

  // ── Step 2: Load all CRM contacts ──
  const { data: allContacts } = await admin.from("contacts")
    .select("id, full_name, phone, phone_mobile, email, telegram_id, telegram_username, maks_id");

  // Build lookup indexes
  const contactByPhone = new Map<string, typeof allContacts extends (infer T)[] | null ? T : never>();
  const contactByTgId = new Map<string, typeof allContacts extends (infer T)[] | null ? T : never>();
  const contactByMaksId = new Map<string, typeof allContacts extends (infer T)[] | null ? T : never>();
  const contactByName = new Map<string, typeof allContacts extends (infer T)[] | null ? T : never>();

  for (const c of allContacts ?? []) {
    if (c.phone) {
      const clean = c.phone.replace(/\D/g, "").slice(-10);
      if (clean.length >= 7) contactByPhone.set(clean, c);
    }
    if (c.phone_mobile) {
      const clean = c.phone_mobile.replace(/\D/g, "").slice(-10);
      if (clean.length >= 7 && !contactByPhone.has(clean)) contactByPhone.set(clean, c);
    }
    if (c.telegram_id) contactByTgId.set(c.telegram_id, c);
    if (c.maks_id) contactByMaksId.set(c.maks_id, c);
    if (c.full_name && c.full_name.trim().length >= 3 && !/^\d+$/.test(c.full_name.trim())) {
      // Store by normalized name — only first match to avoid false positives
      const norm = c.full_name.trim().toLowerCase();
      if (!contactByName.has(norm)) contactByName.set(norm, c);
    }
  }

  // ── Step 3: Match profiles to contacts, write messenger IDs ──
  let matched = 0;
  let enriched = 0;

  for (const p of profiles) {
    // Find CRM contact: phone → tg_id → maks_id → exact name
    let contact = null;
    if (p.phone) {
      const clean = p.phone.replace(/\D/g, "").slice(-10);
      if (clean.length >= 7) contact = contactByPhone.get(clean) ?? null;
    }
    if (!contact && p.tg_id) contact = contactByTgId.get(p.tg_id) ?? null;
    if (!contact && p.maks_id) contact = contactByMaksId.get(p.maks_id) ?? null;
    // Name match — only if name is specific enough (3+ words or 10+ chars)
    if (!contact && p.name) {
      const norm = p.name.trim().toLowerCase();
      const words = norm.split(/\s+/).length;
      if (words >= 2 || norm.length >= 10) {
        contact = contactByName.get(norm) ?? null;
      }
    }

    if (!contact) continue;
    matched++;

    // Write messenger IDs to contact
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {};
    if (p.tg_id && !contact.telegram_id) updates.telegram_id = p.tg_id;
    if (p.tg_username && !contact.telegram_username) updates.telegram_username = p.tg_username;
    if (p.maks_id && !contact.maks_id) updates.maks_id = p.maks_id;
    if (p.phone && !contact.phone) updates.phone = p.phone;
    const isJunk = (n?: string) => !n || /^\d+$/.test(n.trim()) || n.trim().length < 2;
    if (p.name && isJunk(contact.full_name) && !isJunk(p.name)) updates.full_name = p.name;

    if (Object.keys(updates).length > 0) {
      await admin.from("contacts").update(updates).eq("id", contact.id);
      enriched++;
      // Update local indexes
      if (updates.telegram_id) contactByTgId.set(updates.telegram_id, contact);
      if (updates.maks_id) contactByMaksId.set(updates.maks_id, contact);
      if (updates.phone) {
        const clean = updates.phone.replace(/\D/g, "").slice(-10);
        if (clean.length >= 7) contactByPhone.set(clean, contact);
      }
    }
  }

  results.push(`Matched: ${matched}/${profiles.length} profiles to CRM contacts`);
  results.push(`Enriched: ${enriched} contacts with new messenger IDs`);

  // ── Step 4: Cross-link contacts with same phone ──
  let crossLinked = 0;
  const phoneGroups = new Map<string, string[]>();
  for (const c of allContacts ?? []) {
    if (!c.phone) continue;
    const clean = c.phone.replace(/\D/g, "").slice(-10);
    if (clean.length < 7) continue;
    if (!phoneGroups.has(clean)) phoneGroups.set(clean, []);
    phoneGroups.get(clean)!.push(c.id);
  }
  for (const [, ids] of phoneGroups) {
    if (ids.length < 2) continue;
    // Merge messenger IDs across contacts with same phone
    const contacts = (allContacts ?? []).filter((c) => ids.includes(c.id));
    const tgId = contacts.find((c) => c.telegram_id)?.telegram_id;
    const tgUser = contacts.find((c) => c.telegram_username)?.telegram_username;
    const maksId = contacts.find((c) => c.maks_id)?.maks_id;
    for (const c of contacts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upd: any = {};
      if (tgId && !c.telegram_id) upd.telegram_id = tgId;
      if (tgUser && !c.telegram_username) upd.telegram_username = tgUser;
      if (maksId && !c.maks_id) upd.maks_id = maksId;
      if (Object.keys(upd).length > 0) {
        await admin.from("contacts").update(upd).eq("id", c.id);
        crossLinked++;
      }
    }
  }
  results.push(`Cross-linked: ${crossLinked} contacts by phone`);

  return NextResponse.json({ ok: true, results });
}
