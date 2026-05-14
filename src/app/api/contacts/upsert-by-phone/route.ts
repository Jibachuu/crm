import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { phone, full_name, telegram_id, telegram_username, maks_id, email } = await req.json();
  if (!phone && !email && !telegram_id && !maks_id) {
    return NextResponse.json({ error: "phone or other identifier required" }, { status: 400 });
  }

  // Sanitize: if name is just digits (i.e. MAX ID) or empty, treat as no name
  const isJunkName = (n: string | null | undefined) => !n || /^\d+$/.test(String(n).trim()) || String(n).trim().length < 2;
  const cleanName = isJunkName(full_name) ? null : String(full_name).trim();

  const admin = createAdminClient();

  // Search by phone first
  let existing = null;
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, "").slice(-10);
    if (cleanPhone.length >= 7) {
      const { data } = await admin.from("contacts").select("*").ilike("phone", `%${cleanPhone}%`).limit(1).single();
      if (data) existing = data;
    }
  }

  // Search by telegram_id
  if (!existing && telegram_id) {
    const { data } = await admin.from("contacts").select("*").eq("telegram_id", String(telegram_id)).limit(1).single();
    if (data) existing = data;
  }

  // Search by maks_id
  if (!existing && maks_id) {
    const { data } = await admin.from("contacts").select("*").eq("maks_id", String(maks_id)).limit(1).single();
    if (data) existing = data;
  }

  // Search by email
  if (!existing && email) {
    const { data } = await admin.from("contacts").select("*").ilike("email", email).limit(1).single();
    if (data) existing = data;
  }

  if (existing) {
    // Update missing fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {};
    if (phone && !existing.phone) updates.phone = phone;
    // Only overwrite full_name when the stored one is genuinely junk
    // (empty, just digits, or 1 character). The "longer wins" heuristic
    // used to live here was clobbering names that operators had typed in
    // by hand or stitched through a contact-merge — every fresh inbound
    // MAX/Telegram message with a slightly different sender_name was
    // replacing the real name (backlog v6 §2.10).
    if (cleanName && isJunkName(existing.full_name)) updates.full_name = cleanName;
    if (telegram_id && !existing.telegram_id) updates.telegram_id = String(telegram_id);
    if (telegram_username && !existing.telegram_username) updates.telegram_username = telegram_username;
    if (maks_id && !existing.maks_id) updates.maks_id = String(maks_id);
    if (email && !existing.email) updates.email = email;

    if (Object.keys(updates).length > 0) {
      await admin.from("contacts").update(updates).eq("id", existing.id);
    }
    return NextResponse.json({ ok: true, id: existing.id, updated: Object.keys(updates) });
  }

  // Create new — never use digits/MAX_id as name; prefer real name → username → phone → email
  const { data: newContact } = await admin.from("contacts").insert({
    full_name: cleanName || telegram_username || phone || email || "Контакт",
    phone: phone || null,
    telegram_id: telegram_id ? String(telegram_id) : null,
    telegram_username: telegram_username || null,
    maks_id: maks_id ? String(maks_id) : null,
    email: email || null,
    created_by: user.id,
  }).select("id").single();

  return NextResponse.json({ ok: true, id: newContact?.id, created: true });
}
