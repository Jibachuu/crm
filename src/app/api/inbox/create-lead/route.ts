import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickAutoLeadAssignee } from "@/lib/auto-lead-assigner";

// Create a contact + lead from inbox in one shot.
// Used when LinkedEntitiesPanel finds nothing and user wants to convert chat → lead.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    phone,
    full_name,
    telegram_id,
    telegram_username,
    maks_id,
    maks_username,
    email,
    channel, // "telegram" | "maks" | "email" — used in lead title/source
    title,
  } = await req.json();

  if (!phone && !telegram_id && !telegram_username && !maks_id && !email) {
    return NextResponse.json({ error: "Need at least one identifier" }, { status: 400 });
  }

  const admin = createAdminClient();

  const isJunkName = (n: string | null | undefined) =>
    !n || /^\d+$/.test(String(n).trim()) || String(n).trim().length < 2;
  const cleanName = isJunkName(full_name) ? null : String(full_name).trim();

  // Find existing contact by any identifier
  let existing: { id: string; full_name: string | null; phone: string | null; email: string | null; telegram_id: string | null; telegram_username: string | null; maks_id: string | null; maks_username: string | null } | null = null;

  if (phone) {
    const cleanPhone = String(phone).replace(/\D/g, "").slice(-10);
    if (cleanPhone.length >= 7) {
      const { data } = await admin.from("contacts").select("*").ilike("phone", `%${cleanPhone}%`).limit(1).single();
      if (data) existing = data;
    }
  }
  if (!existing && telegram_id) {
    const { data } = await admin.from("contacts").select("*").eq("telegram_id", String(telegram_id)).limit(1).single();
    if (data) existing = data;
  }
  if (!existing && telegram_username) {
    const { data } = await admin.from("contacts").select("*").eq("telegram_username", String(telegram_username)).limit(1).single();
    if (data) existing = data;
  }
  if (!existing && maks_id) {
    const { data } = await admin.from("contacts").select("*").eq("maks_id", String(maks_id)).limit(1).single();
    if (data) existing = data;
  }
  if (!existing && maks_username) {
    const { data } = await admin.from("contacts").select("maks_username").limit(1);
    // maks_username may not exist as a column — skip if errors
    if (data) {
      const { data: byMaksU } = await admin.from("contacts").select("*").eq("maks_username", String(maks_username)).limit(1).single();
      if (byMaksU) existing = byMaksU;
    }
  }
  if (!existing && email) {
    const { data } = await admin.from("contacts").select("*").ilike("email", String(email)).limit(1).single();
    if (data) existing = data;
  }

  let contactId: string;

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {};
    if (phone && !existing.phone) updates.phone = phone;
    // Only overwrite full_name when the stored one is genuinely junk —
    // see /api/contacts/upsert-by-phone for context (backlog v6 §2.10:
    // merged-then-renamed contacts kept getting clobbered by inbound MAX/
    // Telegram messages whose sender_name happened to be a tad longer).
    if (cleanName && isJunkName(existing.full_name)) updates.full_name = cleanName;
    if (telegram_id && !existing.telegram_id) updates.telegram_id = String(telegram_id);
    if (telegram_username && !existing.telegram_username) updates.telegram_username = telegram_username;
    if (maks_id && !existing.maks_id) updates.maks_id = String(maks_id);
    if (email && !existing.email) updates.email = email;
    if (Object.keys(updates).length > 0) {
      await admin.from("contacts").update(updates).eq("id", existing.id);
    }
    contactId = existing.id;
  } else {
    const { data: newContact, error: insertErr } = await admin.from("contacts").insert({
      full_name: cleanName || telegram_username || phone || email || "Контакт",
      phone: phone || null,
      telegram_id: telegram_id ? String(telegram_id) : null,
      telegram_username: telegram_username || null,
      maks_id: maks_id ? String(maks_id) : null,
      email: email || null,
      created_by: user.id,
    }).select("id").single();
    if (insertErr || !newContact) {
      return NextResponse.json({ error: insertErr?.message ?? "Failed to create contact" }, { status: 500 });
    }
    contactId = newContact.id;
  }

  // Default funnel for leads
  const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
  const { data: firstStage } = funnel
    ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single()
    : { data: null };

  const sourceMap: Record<string, string> = { telegram: "telegram", maks: "maks", email: "email" };
  const source = sourceMap[String(channel)] || "other";
  const channelLabel = channel === "telegram" ? "Telegram" : channel === "maks" ? "МАКС" : channel === "email" ? "Email" : "Inbox";
  const leadTitle = title || `${channelLabel}: ${cleanName || telegram_username || phone || email || "новый чат"}`;

  // Round-robin assignment to opted-in users (admin-configured in Settings)
  const assignee = await pickAutoLeadAssignee(admin);

  const { data: lead, error: leadErr } = await admin.from("leads").insert({
    title: leadTitle,
    source,
    status: "new",
    contact_id: contactId,
    funnel_id: funnel?.id ?? null,
    stage_id: firstStage?.id ?? null,
    assigned_to: assignee ?? null,
    created_by: user.id,
  }).select("id").single();

  if (leadErr) {
    return NextResponse.json({ error: leadErr.message, contactId }, { status: 500 });
  }

  return NextResponse.json({ ok: true, contactId, leadId: lead?.id });
}
