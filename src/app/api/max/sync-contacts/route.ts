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

  // Ensure 'avatars' storage bucket exists (idempotent)
  try {
    const { data: buckets } = await admin.storage.listBuckets();
    const exists = (buckets ?? []).some((b) => b.name === "avatars");
    if (!exists) {
      const { error: bErr } = await admin.storage.createBucket("avatars", { public: true });
      if (bErr && !String(bErr.message).toLowerCase().includes("already")) {
        return NextResponse.json({ error: "Не удалось создать bucket avatars: " + bErr.message }, { status: 500 });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: "Bucket check failed: " + String(e) }, { status: 500 });
  }

  let chatsRes;
  try {
    chatsRes = await fetch(`${proxyUrl}/chats`, { headers: { Authorization: proxyKey } });
  } catch (e) {
    return NextResponse.json({ error: "MAX proxy unreachable: " + String(e) }, { status: 503 });
  }
  if (!chatsRes.ok) return NextResponse.json({ error: "MAX proxy returned " + chatsRes.status }, { status: 502 });

  const chatsData = await chatsRes.json();
  let chats: Array<{ chatId?: number | string; title?: string; phone?: string; username?: string; avatar?: string }> = chatsData.chats ?? [];

  // If proxy lost its contact cache (post-restart), most chats come back without name/avatar.
  // Try to force-load contacts via /load-contacts, then re-fetch /chats.
  const enrichedCount = chats.filter((c) => c.title || c.avatar || c.phone).length;
  if (chats.length > 0 && enrichedCount < chats.length / 2) {
    try {
      const ids = chats.map((c) => String(c.chatId)).filter(Boolean);
      await fetch(`${proxyUrl}/load-contacts`, {
        method: "POST",
        headers: { Authorization: proxyKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      // Re-fetch chats after load
      const reRes = await fetch(`${proxyUrl}/chats`, { headers: { Authorization: proxyKey } });
      if (reRes.ok) {
        const reData = await reRes.json();
        chats = reData.chats ?? chats;
      }
    } catch { /* ignore — fall through with whatever we have */ }
  }

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

  // ── Backfill names from communications.sender_name ──
  // For contacts that have a maks_id but a junk/empty name, look at incoming
  // MAX/messenger communications and use the latest sender_name we've stored.
  let backfilledFromComms = 0;
  try {
    const { data: junkContacts } = await admin
      .from("contacts")
      .select("id, full_name, maks_id")
      .not("maks_id", "is", null);
    const candidates = (junkContacts ?? []).filter((c) => isJunkName(c.full_name));
    for (const c of candidates) {
      const { data: lastComm } = await admin
        .from("communications")
        .select("sender_name")
        .eq("contact_id", c.id)
        .eq("direction", "incoming")
        .not("sender_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastComm?.sender_name && !isJunkName(lastComm.sender_name)) {
        await admin.from("contacts").update({ full_name: lastComm.sender_name }).eq("id", c.id);
        backfilledFromComms++;
      }
    }
  } catch (e) {
    errors.push("comms backfill: " + String(e));
  }

  return NextResponse.json({
    ok: true,
    chatsScanned: chats.length,
    backfilledFromComms,
    createdContacts,
    updatedNames,
    updatedAvatars,
    errors: errors.slice(0, 20),
  });
}
