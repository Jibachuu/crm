import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Bulk link: for ALL contacts with phone but missing tg/maks IDs,
// try to find them in Telegram and MAX via proxy APIs
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // 1. Load TG dialogs + MAX chats (all at once)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tgByPhone = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tgByUsername = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxByPhone = new Map<string, any>();

  try {
    const { tgProxy } = await import("@/lib/telegram/proxy");
    const data = await tgProxy<{ dialogs: Array<{ id: string; name: string; username: string | null; phone: string | null; isUser: boolean }> }>("/dialogs");
    for (const d of data.dialogs ?? []) {
      if (!d.isUser) continue;
      if (d.phone) {
        const clean = d.phone.replace(/\D/g, "").slice(-10);
        if (clean.length >= 7) tgByPhone.set(clean, { id: String(d.id), username: d.username, name: d.name });
      }
      if (d.username) tgByUsername.set(d.username.toLowerCase(), { id: String(d.id), username: d.username, name: d.name });
    }
  } catch { /* TG proxy unavailable */ }

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
          if (c.phone) {
            const clean = String(c.phone).replace(/\D/g, "").slice(-10);
            if (clean.length >= 7) maxByPhone.set(clean, { id: chatId, name: c.title });
          }
        }
      }
    }
  } catch { /* MAX proxy unavailable */ }

  // 2. Load all contacts missing tg or maks
  const { data: contacts } = await admin.from("contacts")
    .select("id, phone, phone_mobile, phone_other, telegram_id, telegram_username, maks_id")
    .or("telegram_id.is.null,maks_id.is.null");

  let linked = 0;
  const results: string[] = [];

  for (const contact of contacts ?? []) {
    const phones = [contact.phone, contact.phone_mobile, contact.phone_other].filter(Boolean) as string[];
    if (phones.length === 0) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {};

    // Find in TG by phone
    if (!contact.telegram_id) {
      for (const p of phones) {
        const clean = p.replace(/\D/g, "").slice(-10);
        if (clean.length < 7) continue;
        const tg = tgByPhone.get(clean);
        if (tg) {
          updates.telegram_id = tg.id;
          if (tg.username && !contact.telegram_username) updates.telegram_username = tg.username;
          break;
        }
      }
      // Also try by existing telegram_username
      if (!updates.telegram_id && contact.telegram_username) {
        const tg = tgByUsername.get(contact.telegram_username.toLowerCase());
        if (tg) updates.telegram_id = tg.id;
      }
    }

    // Find in MAX by phone
    if (!contact.maks_id) {
      for (const p of phones) {
        const clean = p.replace(/\D/g, "").slice(-10);
        if (clean.length < 7) continue;
        const max = maxByPhone.get(clean);
        if (max) {
          updates.maks_id = max.id;
          break;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await admin.from("contacts").update(updates).eq("id", contact.id);
      linked++;
      const parts = [];
      if (updates.telegram_id) parts.push("TG");
      if (updates.maks_id) parts.push("MAX");
      results.push(`${contact.phone}: +${parts.join("+")}`);
    }
  }

  return NextResponse.json({
    ok: true,
    total_contacts: contacts?.length ?? 0,
    tg_dialogs: tgByPhone.size,
    max_chats: maxByPhone.size,
    linked,
    details: results.slice(0, 50),
  });
}
