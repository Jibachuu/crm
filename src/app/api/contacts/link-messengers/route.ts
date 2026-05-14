import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Generate every Russian phone variant a messenger proxy might accept.
 * Covers: 89xx (Russian local), 79xx (international without plus),
 * +79xx (E.164), bare 9xx (10-digit national without country code) —
 * and any +CC… input that's already canonical.
 *
 * The MAX/TG proxies are picky about format; the more we try, the
 * more contacts get successfully linked. Bug фикс по жалобам Рустема
 * 13.04 ("89616363487 не находится в TG").
 */
function normalizePhone(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  const variants: string[] = [];

  if (digits.length === 11 && digits.startsWith("8")) {
    // 89991234567 — Russian local
    const tail = digits.slice(1); // 9991234567
    variants.push("+7" + tail, "7" + tail, digits);
  } else if (digits.length === 11 && digits.startsWith("7")) {
    // 79991234567
    variants.push("+" + digits, digits, "8" + digits.slice(1));
  } else if (digits.length === 10) {
    // 9991234567 — bare national number
    variants.push("+7" + digits, "7" + digits, "8" + digits);
  } else if (digits.length >= 10) {
    // Any other foreign number — try with and without +
    variants.push("+" + digits, digits);
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
  // Track WHY each proxy didn't link, so the client can show
  // «не найдено» vs «прокси не отвечает» (backlog v6 §5.9).
  const tgErrors: string[] = [];
  const maxErrors: string[] = [];

  // --- Telegram: try username first, then phone (direct to TG proxy) ---
  if (!contact.telegram_id) {
    const { tgProxy } = await import("@/lib/telegram/proxy");
    // 1. By username
    if (tgUsername) {
      try {
        const data = await tgProxy<{ ok: boolean; user?: { id: string; username?: string; firstName?: string; lastName?: string } }>("/add-contact", { method: "POST", body: { username: tgUsername } });
        if (data.ok && data.user?.id) {
          results.telegram = {
            id: String(data.user.id),
            username: data.user.username || tgUsername,
            name: `${data.user.firstName || ""} ${data.user.lastName || ""}`.trim() || undefined,
          };
        }
      } catch (e) { tgErrors.push(`by username @${tgUsername}: ${String(e)}`); }
    }
    // 2. By phone
    if (!results.telegram) {
      for (const rawPhone of phones) {
        const variants = normalizePhone(rawPhone);
        for (const phone of variants) {
          try {
            const data = await tgProxy<{ ok: boolean; user?: { id: string; username?: string; firstName?: string; lastName?: string } }>("/add-contact", { method: "POST", body: { phone } });
            if (data.ok && data.user?.id) {
              results.telegram = {
                id: String(data.user.id),
                username: data.user.username || undefined,
                name: `${data.user.firstName || ""} ${data.user.lastName || ""}`.trim() || undefined,
              };
              break;
            }
          } catch (e) { tgErrors.push(`by phone ${phone}: ${String(e)}`); }
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
    if (!maxUrl || !maxKey) {
      maxErrors.push("MAX proxy не настроен (MAX_PROXY_URL / MAX_PROXY_KEY)");
    } else {
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
            if (!data.ok && data.error) maxErrors.push(`${phone}: ${data.error}`);
          } catch (e) { maxErrors.push(`${phone}: ${String(e)}`); }
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
    // Surface proxy/normalisation failures so the operator can see WHY
    // a search came back empty (network, dead session, no number variant
    // worked, etc) instead of just «Мессенджеры не найдены».
    tg_errors: tgErrors.length > 0 && !results.telegram ? tgErrors.slice(-3) : undefined,
    max_errors: maxErrors.length > 0 && !results.maks ? maxErrors.slice(-3) : undefined,
  });
}
