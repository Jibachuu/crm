import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Normalize Russian phone: 89xx → +79xx, 79xx → +79xx */
function normalizePhone(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  const variants: string[] = [];
  if (digits.startsWith("8") && digits.length === 11) {
    variants.push("+7" + digits.slice(1));
    variants.push("7" + digits.slice(1));
    variants.push(digits); // raw 8xxx
  } else if (digits.startsWith("7") && digits.length === 11) {
    variants.push("+" + digits);
    variants.push(digits);
    variants.push("8" + digits.slice(1));
  } else if (digits.length >= 10) {
    variants.push("+" + digits);
    variants.push(digits);
  }
  return [...new Set(variants)];
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contact_id } = await req.json();
  if (!contact_id) return NextResponse.json({ error: "contact_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: contact } = await admin.from("contacts").select("id, phone, phone_mobile, phone_other, telegram_id, telegram_username, maks_id").eq("id", contact_id).single();
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const phones = [contact.phone, contact.phone_mobile, contact.phone_other].filter(Boolean) as string[];
  const tgUsername = contact.telegram_username?.replace("@", "").trim() || null;

  if (phones.length === 0 && !tgUsername) return NextResponse.json({ error: "У контакта нет ни телефона, ни Telegram username" }, { status: 400 });

  const results: { telegram?: { id: string; username?: string; name?: string }; maks?: { id: string; name?: string }; error?: string } = {};

  // --- Telegram: try username first, then phone ---
  if (!contact.telegram_id) {
    // 1. By username (most reliable for TG)
    if (tgUsername) {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_URL || ""}/api/telegram/add-contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
          body: JSON.stringify({ username: tgUsername }),
        });
        const data = await res.json();
        if (data.ok && data.user?.id) {
          results.telegram = {
            id: String(data.user.id),
            username: data.user.username || tgUsername,
            name: `${data.user.firstName || ""} ${data.user.lastName || ""}`.trim() || undefined,
          };
        }
      } catch { /* try phone next */ }
    }
    // 2. By phone
    if (!results.telegram) {
      for (const rawPhone of phones) {
        const variants = normalizePhone(rawPhone);
        for (const phone of variants) {
          try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_URL || ""}/api/telegram/add-contact`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
              body: JSON.stringify({ phone }),
            });
            const data = await res.json();
            if (data.ok && data.user?.id) {
              results.telegram = {
                id: String(data.user.id),
                username: data.user.username || undefined,
                name: `${data.user.firstName || ""} ${data.user.lastName || ""}`.trim() || undefined,
              };
              break;
            }
          } catch { /* try next variant */ }
        }
        if (results.telegram) break;
      }
    }
  } else {
    results.telegram = { id: contact.telegram_id, username: contact.telegram_username || undefined };
  }

  // --- MAX: by phone ---
  if (!contact.maks_id) {
    const maxUrl = process.env.MAX_PROXY_URL;
    const maxKey = process.env.MAX_PROXY_KEY;
    if (maxUrl && maxKey) {
      for (const rawPhone of phones) {
        const variants = normalizePhone(rawPhone);
        for (const phone of variants) {
          try {
            const res = await fetch(`${maxUrl}/add-contact`, {
              method: "POST",
              headers: { Authorization: maxKey, "Content-Type": "application/json" },
              body: JSON.stringify({ phone, firstName: "", lastName: "" }),
            });
            const data = await res.json();
            if (data.ok && (data.chatId || data.contact?.id)) {
              results.maks = {
                id: String(data.chatId || data.contact.id),
                name: data.contact?.name || undefined,
              };
              break;
            }
          } catch { /* try next */ }
        }
        if (results.maks) break;
      }
    }
  } else {
    results.maks = { id: contact.maks_id };
  }

  // Update contact with found messenger IDs
  const updates: Record<string, string> = {};
  if (results.telegram?.id && !contact.telegram_id) updates.telegram_id = results.telegram.id;
  if (results.telegram?.username && !contact.telegram_username) updates.telegram_username = results.telegram.username;
  if (results.maks?.id && !contact.maks_id) updates.maks_id = results.maks.id;

  if (Object.keys(updates).length > 0) {
    await admin.from("contacts").update(updates).eq("id", contact_id);
  }

  return NextResponse.json({
    ok: true,
    linked: {
      telegram: results.telegram?.id ? true : false,
      maks: results.maks?.id ? true : false,
    },
    updates,
  });
}
