import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Sync messenger data (username, phone) from TG/MAX proxies into CRM contacts
// Run manually or via cron to enrich contacts that only have numeric IDs
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const results: string[] = [];

  // ── 1. Enrich from Telegram dialogs ──
  try {
    const { tgProxy } = await import("@/lib/telegram/proxy");
    const dialogsData = await tgProxy<{ dialogs: Array<{ id: string; name: string; username: string | null; phone: string | null; isUser: boolean }> }>("/dialogs");

    // Build lookup: tg_id → { username, phone, name }
    const tgMap = new Map<string, { username?: string; phone?: string; name?: string }>();
    for (const d of dialogsData.dialogs ?? []) {
      if (!d.isUser) continue;
      tgMap.set(String(d.id), {
        username: d.username || undefined,
        phone: d.phone ? String(d.phone) : undefined,
        name: d.name || undefined,
      });
    }

    // Find contacts with telegram_id that are missing username or phone
    const { data: tgContacts } = await admin.from("contacts")
      .select("id, full_name, phone, telegram_id, telegram_username")
      .not("telegram_id", "is", null);

    let tgUpdated = 0;
    for (const contact of tgContacts ?? []) {
      if (!contact.telegram_id) continue;
      const tgData = tgMap.get(contact.telegram_id);
      if (!tgData) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: any = {};
      if (tgData.username && !contact.telegram_username) updates.telegram_username = tgData.username;
      if (tgData.phone && !contact.phone) updates.phone = tgData.phone;
      const isJunk = (n?: string) => !n || /^\d+$/.test(n.trim()) || n.trim().length < 2;
      if (tgData.name && isJunk(contact.full_name) && !isJunk(tgData.name)) updates.full_name = tgData.name;

      if (Object.keys(updates).length > 0) {
        await admin.from("contacts").update(updates).eq("id", contact.id);
        tgUpdated++;
      }
    }
    results.push(`Telegram: enriched ${tgUpdated}/${tgContacts?.length ?? 0} contacts`);
  } catch (e) {
    results.push(`Telegram error: ${String(e).slice(0, 100)}`);
  }

  // ── 2. Enrich from MAX chats ──
  try {
    const maxProxy = process.env.MAX_PROXY_URL;
    const maxKey = process.env.MAX_PROXY_KEY;
    if (maxProxy && maxKey) {
      const res = await fetch(`${maxProxy}/chats`, { headers: { Authorization: maxKey } });
      if (res.ok) {
        const data = await res.json();
        const maxMap = new Map<string, { phone?: string; name?: string }>();
        for (const c of data.chats ?? []) {
          const chatId = String(c.chatId ?? c.id ?? "");
          if (!chatId) continue;
          maxMap.set(chatId, {
            phone: c.phone ? String(c.phone) : undefined,
            name: c.title && !/^\d+$/.test(c.title.trim()) ? c.title : undefined,
          });
        }

        const { data: maxContacts } = await admin.from("contacts")
          .select("id, full_name, phone, maks_id")
          .not("maks_id", "is", null);

        let maxUpdated = 0;
        for (const contact of maxContacts ?? []) {
          if (!contact.maks_id) continue;
          const maxData = maxMap.get(contact.maks_id);
          if (!maxData) continue;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updates: any = {};
          if (maxData.phone && !contact.phone) updates.phone = maxData.phone;
          const isJunk = (n?: string) => !n || /^\d+$/.test(n.trim()) || n.trim().length < 2;
          if (maxData.name && isJunk(contact.full_name) && !isJunk(maxData.name)) updates.full_name = maxData.name;

          if (Object.keys(updates).length > 0) {
            await admin.from("contacts").update(updates).eq("id", contact.id);
            maxUpdated++;
          }
        }
        results.push(`MAX: enriched ${maxUpdated}/${maxContacts?.length ?? 0} contacts`);
      }
    }
  } catch (e) {
    results.push(`MAX error: ${String(e).slice(0, 100)}`);
  }

  // ── 3. Cross-link: find contacts with same phone but different messenger IDs ──
  try {
    const { data: allContacts } = await admin.from("contacts")
      .select("id, phone, telegram_id, maks_id")
      .not("phone", "is", null);

    const byPhone = new Map<string, typeof allContacts extends (infer T)[] | null ? T : never>();
    let crossLinked = 0;
    for (const c of allContacts ?? []) {
      if (!c.phone) continue;
      const clean = c.phone.replace(/\D/g, "").slice(-10);
      if (clean.length < 7) continue;

      const existing = byPhone.get(clean);
      if (existing && existing.id !== c.id) {
        // Two contacts with same phone — merge messenger IDs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {};
        if (existing.telegram_id && !c.telegram_id) updates.telegram_id = existing.telegram_id;
        if (existing.maks_id && !c.maks_id) updates.maks_id = existing.maks_id;
        if (c.telegram_id && !existing.telegram_id) {
          await admin.from("contacts").update({ telegram_id: c.telegram_id }).eq("id", existing.id);
        }
        if (c.maks_id && !existing.maks_id) {
          await admin.from("contacts").update({ maks_id: c.maks_id }).eq("id", existing.id);
        }
        if (Object.keys(updates).length > 0) {
          await admin.from("contacts").update(updates).eq("id", c.id);
          crossLinked++;
        }
      }
      if (!byPhone.has(clean)) byPhone.set(clean, c);
    }
    results.push(`Cross-linked: ${crossLinked} contacts by phone`);
  } catch (e) {
    results.push(`Cross-link error: ${String(e).slice(0, 100)}`);
  }

  return NextResponse.json({ ok: true, results });
}
