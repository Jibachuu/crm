import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickAutoLeadAssignee } from "@/lib/auto-lead-assigner";

// Dynamic imports for IMAP
async function getImapModules() {
  try {
    const { ImapFlow } = await import("imapflow");
    const { simpleParser } = await import("mailparser");
    return { ImapFlow, simpleParser };
  } catch {
    return null;
  }
}

// ── Core logic: find or create contact, only create lead if contact is NEW ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findOrCreateContact(admin: any, identifiers: {
  telegram_id?: string; telegram_username?: string; maks_id?: string;
  phone?: string; email?: string; full_name?: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}, createdBy?: string): Promise<{ contactId: string; isNew: boolean }> {
  const { telegram_id, telegram_username, maks_id, phone, email, full_name } = identifiers;

  // 1) Search by all known identifiers
  const orFilters: string[] = [];
  if (telegram_id) orFilters.push(`telegram_id.eq.${telegram_id}`);
  if (maks_id) orFilters.push(`maks_id.eq.${maks_id}`);
  if (email) orFilters.push(`email.ilike.${email}`);
  if (phone) {
    const clean = phone.replace(/\D/g, "").slice(-10);
    if (clean.length >= 7) {
      orFilters.push(`phone.ilike.%${clean}`);
      orFilters.push(`phone_mobile.ilike.%${clean}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existing: any = null;
  if (orFilters.length > 0) {
    const { data } = await admin.from("contacts").select("id, full_name, phone, telegram_id, telegram_username, maks_id, email")
      .or(orFilters.join(",")).limit(1).single();
    if (data) existing = data;
  }

  if (existing) {
    // Enrich missing fields on existing contact
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {};
    const isJunk = (n?: string) => !n || /^\d+$/.test(n.trim()) || n.trim().length < 2;
    if (full_name && isJunk(existing.full_name) && !isJunk(full_name)) updates.full_name = full_name;
    if (telegram_id && !existing.telegram_id) updates.telegram_id = telegram_id;
    if (telegram_username && !existing.telegram_username) updates.telegram_username = telegram_username;
    if (maks_id && !existing.maks_id) updates.maks_id = maks_id;
    if (phone && !existing.phone) updates.phone = phone;
    if (email && !existing.email) updates.email = email;
    if (Object.keys(updates).length > 0) {
      await admin.from("contacts").update(updates).eq("id", existing.id);
    }
    return { contactId: existing.id, isNew: false };
  }

  // 2) No match — create new contact
  const isJunkName = (n?: string) => !n || /^\d+$/.test(n.trim()) || n.trim().length < 2;
  const { data: newContact } = await admin.from("contacts").insert({
    full_name: isJunkName(full_name) ? (phone || email || "Контакт") : full_name,
    telegram_id: telegram_id || null,
    telegram_username: telegram_username || null,
    maks_id: maks_id || null,
    phone: phone || null,
    email: email || null,
    created_by: createdBy || null,
  }).select("id").single();

  return { contactId: newContact?.id, isNew: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createLeadForContact(admin: any, contactId: string, title: string, source: string, createdBy?: string) {
  // Only create lead if this contact has ZERO leads (truly first contact)
  const { data: existingLead } = await admin.from("leads").select("id").eq("contact_id", contactId).limit(1).single();
  if (existingLead) return null;

  const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
  const { data: firstStage } = funnel
    ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single()
    : { data: null };
  const assignee = await pickAutoLeadAssignee(admin);

  const { data: lead } = await admin.from("leads").insert({
    title, source, status: "new",
    contact_id: contactId,
    funnel_id: funnel?.id ?? null,
    stage_id: firstStage?.id ?? null,
    assigned_to: assignee ?? null,
    created_by: createdBy || null,
  }).select("id").single();

  return lead;
}

// ── POST: full sync (Telegram + MAX + Email) ──
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({ source: "all" }));
  const { source } = body;
  const admin = createAdminClient();
  const results: string[] = [];
  const adminId = (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id;

  // ── TELEGRAM ──
  if (source === "all" || source === "telegram") {
    try {
      const { tgProxy } = await import("@/lib/telegram/proxy");
      const dialogsData = await tgProxy<{ dialogs: Array<{ id: string; name: string; username: string | null; phone: string | null; isUser: boolean }> }>("/dialogs");

      for (const dialog of dialogsData.dialogs ?? []) {
        if (!dialog.isUser) continue;
        const { contactId, isNew } = await findOrCreateContact(admin, {
          telegram_id: String(dialog.id),
          telegram_username: dialog.username || undefined,
          phone: dialog.phone ? String(dialog.phone) : undefined,
          full_name: dialog.name || undefined,
        }, adminId);
        if (!contactId) continue;

        if (isNew) {
          const lead = await createLeadForContact(admin, contactId, `Telegram: ${dialog.name || dialog.id}`, "telegram", adminId);
          if (lead) results.push(`Lead: TG ${dialog.name}`);
        }
      }
    } catch (e) {
      results.push(`Telegram error: ${e}`);
    }
  }

  // ── MAX ──
  if (source === "all" || source === "max") {
    try {
      const maxProxy = process.env.MAX_PROXY_URL;
      const maxKey = process.env.MAX_PROXY_KEY;
      if (maxProxy && maxKey) {
        const res = await fetch(`${maxProxy}/chats`, { headers: { Authorization: maxKey } });
        if (res.ok) {
          const data = await res.json();
          for (const chat of data.chats ?? []) {
            const chatId = String(chat.chatId ?? "");
            if (!chatId || Number(chatId) < 0) continue;
            const chatPhone = chat.phone ? String(chat.phone) : undefined;
            const chatName = chat.title && !/^\d+$/.test(chat.title.trim()) && chat.title.trim().length >= 2 ? chat.title : undefined;

            const { contactId, isNew } = await findOrCreateContact(admin, {
              maks_id: chatId,
              phone: chatPhone,
              full_name: chatName,
            }, adminId);
            if (!contactId) continue;

            if (isNew) {
              const lead = await createLeadForContact(admin, contactId, `МАКС: ${chatName || chatId}`, "maks", adminId);
              if (lead) results.push(`Lead: MAX ${chatName || chatId}`);
            }
          }
        }
      }
    } catch (e) {
      results.push(`MAX error: ${e}`);
    }
  }

  // ── EMAIL ──
  if (source === "all" || source === "email") {
    const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
    const imapUser = process.env.IMAP_USER || process.env.SMTP_USER;
    const imapPass = process.env.IMAP_PASS || process.env.SMTP_PASS;
    const port = Number(process.env.IMAP_PORT || 993);
    const imap = await getImapModules();

    if (host && imapUser && imapPass && imap) {
      let client: InstanceType<typeof imap.ImapFlow> | null = null;
      try {
        client = new imap.ImapFlow({ host, port, secure: true, auth: { user: imapUser, pass: imapPass }, logger: false });
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");
        try {
          const mailbox = client.mailbox as { exists?: number } | false;
          const total = (mailbox && typeof mailbox === "object") ? (mailbox.exists ?? 0) : 0;
          if (total > 0) {
            const startSeq = Math.max(1, total - 20 + 1);
            for await (const msg of client.fetch(`${startSeq}:*`, { uid: true, source: true })) {
              try {
                const parsed = await imap.simpleParser(msg.source as Buffer);
                const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase();
                const fromName = parsed.from?.value?.[0]?.name ?? parsed.from?.text ?? "";
                if (!fromEmail || fromEmail === imapUser.toLowerCase()) continue;

                const { contactId, isNew } = await findOrCreateContact(admin, {
                  email: fromEmail,
                  full_name: fromName || undefined,
                }, adminId);
                if (!contactId) continue;

                if (isNew) {
                  const lead = await createLeadForContact(admin, contactId, `Email: ${fromName || fromEmail}`, "email", adminId);
                  if (lead) results.push(`Lead: Email ${fromName || fromEmail}`);
                }
              } catch { /* skip */ }
            }
          }
        } finally { lock.release(); }
        await client.logout();
      } catch (e) {
        results.push(`Email error: ${e}`);
        if (client) try { await client.logout(); } catch {}
      }
    }
  }

  return NextResponse.json({ ok: true, results, created: results.filter((r) => r.startsWith("Lead")).length });
}

// ── GET: cron trigger (Telegram + MAX) ──
export async function GET() {
  const admin = createAdminClient();
  const results: string[] = [];
  const adminId = (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id;

  // ── TELEGRAM ──
  try {
    const { tgProxy } = await import("@/lib/telegram/proxy");
    const dialogsData = await tgProxy<{ dialogs: Array<{ id: string; name: string; username: string | null; phone: string | null; isUser: boolean }> }>("/dialogs");

    for (const dialog of dialogsData.dialogs ?? []) {
      if (!dialog.isUser) continue;
      const { contactId, isNew } = await findOrCreateContact(admin, {
        telegram_id: String(dialog.id),
        telegram_username: dialog.username || undefined,
        phone: dialog.phone ? String(dialog.phone) : undefined,
        full_name: dialog.name || undefined,
      }, adminId);
      if (!contactId) continue;

      if (isNew) {
        const lead = await createLeadForContact(admin, contactId, `Telegram: ${dialog.name || dialog.id}`, "telegram", adminId);
        if (lead) results.push(`Lead: TG ${dialog.name}`);
      }
    }
  } catch (e) {
    results.push(`Telegram error: ${e}`);
  }

  // ── MAX ──
  try {
    const maxProxy = process.env.MAX_PROXY_URL;
    const maxKey = process.env.MAX_PROXY_KEY;
    if (maxProxy && maxKey) {
      const res = await fetch(`${maxProxy}/chats`, { headers: { Authorization: maxKey } });
      if (res.ok) {
        const data = await res.json();
        for (const chat of data.chats ?? []) {
          const chatId = String(chat.chatId ?? "");
          if (!chatId || Number(chatId) < 0) continue;
          const chatPhone = chat.phone ? String(chat.phone) : undefined;
          const rawName = chat.title ?? "";
          const chatName = rawName && !/^\d+$/.test(rawName.trim()) && rawName.trim().length >= 2 ? rawName : undefined;

          const { contactId, isNew } = await findOrCreateContact(admin, {
            maks_id: chatId,
            phone: chatPhone,
            full_name: chatName,
          }, adminId);
          if (!contactId) continue;

          if (isNew) {
            const lead = await createLeadForContact(admin, contactId, `МАКС: ${chatName || chatId}`, "maks", adminId);
            if (lead) results.push(`Lead: MAX ${chatName || chatId}`);
          }
        }
      }
    }
  } catch (e) {
    results.push(`MAX error: ${e}`);
  }

  return NextResponse.json({ ok: true, results, created: results.filter((r) => r.startsWith("Lead")).length });
}
