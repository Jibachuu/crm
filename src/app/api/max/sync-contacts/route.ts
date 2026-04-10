import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Sync MAX chats from VPS proxy → save names/usernames into contacts,
// and download avatars (data URLs or http URLs) into Supabase Storage so they
// survive VPS restarts. Idempotent — safe to call repeatedly.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proxyUrl = process.env.MAX_PROXY_URL;
  const proxyKey = process.env.MAX_PROXY_KEY;
  if (!proxyUrl || !proxyKey) return NextResponse.json({ error: "MAX proxy not configured" }, { status: 503 });

  const admin = createAdminClient();

  let chatsRes;
  try {
    chatsRes = await fetch(`${proxyUrl}/chats`, { headers: { Authorization: proxyKey } });
  } catch (e) {
    return NextResponse.json({ error: "MAX proxy unreachable: " + String(e) }, { status: 503 });
  }
  if (!chatsRes.ok) return NextResponse.json({ error: "MAX proxy returned " + chatsRes.status }, { status: 502 });

  const chatsData = await chatsRes.json();
  const chats: Array<{ chatId?: number | string; title?: string; phone?: string; username?: string; avatar?: string }> = chatsData.chats ?? [];

  let updatedNames = 0;
  let updatedAvatars = 0;
  let createdContacts = 0;
  const errors: string[] = [];

  const isJunkName = (n: string | null | undefined) => !n || /^\d+$/.test(String(n).trim()) || String(n).trim().length < 2;

  for (const chat of chats) {
    const chatId = String(chat.chatId ?? "");
    if (!chatId || Number(chatId) < 0) continue;

    const rawName = chat.title ?? "";
    const name = isJunkName(rawName) ? "" : rawName;
    const phone = chat.phone ? String(chat.phone) : null;
    const username = chat.username ? String(chat.username) : null;
    const avatar = chat.avatar ? String(chat.avatar) : null;

    // Find existing contact by maks_id, then by phone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let existing: any = null;
    const { data: byMaksId } = await admin.from("contacts").select("id, full_name, phone, avatar_url, maks_username").eq("maks_id", chatId).limit(1).single();
    if (byMaksId) existing = byMaksId;
    if (!existing && phone) {
      const cleanPhone = phone.replace(/\D/g, "").slice(-10);
      if (cleanPhone.length >= 7) {
        const { data: byPhone } = await admin.from("contacts").select("id, full_name, phone, avatar_url, maks_username").ilike("phone", `%${cleanPhone}%`).limit(1).single();
        if (byPhone) existing = byPhone;
      }
    }

    // Upload avatar to Supabase Storage if present and not already cached
    let avatarUrl: string | null = existing?.avatar_url ?? null;
    if (avatar && (!existing?.avatar_url || !existing.avatar_url.includes("supabase.co"))) {
      try {
        let buffer: Uint8Array | null = null;
        let contentType = "image/jpeg";
        if (avatar.startsWith("data:")) {
          // data URL: data:image/jpeg;base64,XXXX
          const m = avatar.match(/^data:([^;]+);base64,(.+)$/);
          if (m) {
            contentType = m[1];
            buffer = Uint8Array.from(Buffer.from(m[2], "base64"));
          }
        } else if (avatar.startsWith("http")) {
          const r = await fetch(avatar);
          if (r.ok) {
            contentType = r.headers.get("content-type") || "image/jpeg";
            buffer = new Uint8Array(await r.arrayBuffer());
          }
        }
        if (buffer && buffer.length > 0) {
          const ext = contentType.split("/")[1]?.split("+")[0] || "jpg";
          const path = `max/${chatId}.${ext}`;
          const up = await admin.storage.from("avatars").upload(path, buffer, { contentType, upsert: true });
          if (!up.error) {
            const { data: pub } = admin.storage.from("avatars").getPublicUrl(path);
            avatarUrl = pub.publicUrl;
            updatedAvatars++;
          } else {
            errors.push(`avatar upload ${chatId}: ${up.error.message}`);
          }
        }
      } catch (e) {
        errors.push(`avatar fetch ${chatId}: ${String(e)}`);
      }
    }

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upd: any = {};
      if (name && (isJunkName(existing.full_name) || existing.full_name === chatId)) {
        upd.full_name = name;
        updatedNames++;
      }
      if (phone && !existing.phone) upd.phone = phone;
      if (username && !existing.maks_username) upd.maks_username = username;
      if (avatarUrl && avatarUrl !== existing.avatar_url) upd.avatar_url = avatarUrl;
      if (Object.keys(upd).length > 0) {
        await admin.from("contacts").update(upd).eq("id", existing.id);
      }
    } else {
      // Create new contact
      const { error: insErr } = await admin.from("contacts").insert({
        full_name: name || phone || "Контакт",
        maks_id: chatId,
        maks_username: username,
        phone,
        avatar_url: avatarUrl,
        created_by: user.id,
      });
      if (!insErr) createdContacts++;
      else errors.push(`insert ${chatId}: ${insErr.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    chatsScanned: chats.length,
    createdContacts,
    updatedNames,
    updatedAvatars,
    errors: errors.slice(0, 20),
  });
}
