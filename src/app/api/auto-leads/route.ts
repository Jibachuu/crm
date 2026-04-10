import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickAutoLeadAssignee } from "@/lib/auto-lead-assigner";

// Dynamic imports for IMAP (may not work in all serverless environments)
async function getImapModules() {
  try {
    const { ImapFlow } = await import("imapflow");
    const { simpleParser } = await import("mailparser");
    return { ImapFlow, simpleParser };
  } catch {
    return null;
  }
}

// Auto-create leads from new messages (Telegram, MAX, Email)
// Called by cron or manually

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({ source: "all" }));
  const { source } = body;
  const admin = createAdminClient();
  const results: string[] = [];

  // Get all existing contacts by telegram_id, maks_id, email
  const { data: existingContacts } = await admin.from("contacts").select("id, telegram_id, maks_id, email, phone, full_name");
  const telegramIds = new Set((existingContacts ?? []).filter((c) => c.telegram_id).map((c) => c.telegram_id));
  const maksIds = new Set((existingContacts ?? []).filter((c) => c.maks_id).map((c) => c.maks_id));

  // ── TELEGRAM: check for new dialogs not in contacts (via VPS proxy) ──
  if (source === "all" || source === "telegram") {
    try {
      const { tgProxy } = await import("@/lib/telegram/proxy");
      const dialogsData = await tgProxy<{ dialogs: Array<{ id: string; name: string; username: string | null; phone: string | null; isUser: boolean }> }>("/dialogs");

      const adminUser = (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data;
      const adminId = adminUser?.id;
      const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
      const { data: firstStage } = funnel
        ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single()
        : { data: null };

      for (const dialog of dialogsData.dialogs ?? []) {
        if (!dialog.isUser) continue;

        const tgId = String(dialog.id);
        const tgUsername = dialog.username || null;
        const tgPhone = dialog.phone ? String(dialog.phone) : null;
        const tgName = dialog.name || tgUsername || tgId;

        // Find existing contact by telegram_id, then by phone
        let dbContact = null;
        const { data: byTgId } = await admin.from("contacts").select("id, full_name, phone, telegram_id").eq("telegram_id", tgId).limit(1).single();
        if (byTgId) dbContact = byTgId;

        if (!dbContact && tgPhone) {
          const cleanPhone = tgPhone.replace(/\D/g, "").slice(-10);
          const { data: byPhone } = await admin.from("contacts").select("id, full_name, phone, telegram_id").ilike("phone", `%${cleanPhone}%`).limit(1).single();
          if (byPhone) dbContact = byPhone;
        }

        let contactId;
        if (dbContact) {
          // Update missing fields
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updates: any = {};
          if (tgName && (!dbContact.full_name || dbContact.full_name === tgId || /^\d+$/.test(dbContact.full_name))) updates.full_name = tgName;
          if (tgPhone && !dbContact.phone) updates.phone = tgPhone;
          if (tgId && !dbContact.telegram_id) updates.telegram_id = tgId;
          if (tgUsername) updates.telegram_username = tgUsername;
          if (Object.keys(updates).length > 0) {
            await admin.from("contacts").update(updates).eq("id", dbContact.id);
          }
          contactId = dbContact.id;
        } else {
          const { data: newContact } = await admin.from("contacts")
            .insert({
              full_name: tgName,
              phone: tgPhone,
              telegram_id: tgId,
              telegram_username: tgUsername,
              created_by: adminId,
            })
            .select("id")
            .single();
          contactId = newContact?.id;
          if (!contactId) continue;
        }

        // Check if lead already exists
        const { data: existingLead } = await admin.from("leads").select("id").eq("source", "telegram").eq("contact_id", contactId).limit(1).single();
        if (existingLead) continue;

        const tgAssignee = await pickAutoLeadAssignee(admin);
        await admin.from("leads").insert({
          title: `Telegram: ${tgName}`,
          source: "telegram",
          status: "new",
          contact_id: contactId,
          funnel_id: funnel?.id ?? null,
          stage_id: firstStage?.id ?? null,
          assigned_to: tgAssignee ?? null,
          created_by: adminId,
        });
        results.push(`Lead created: Telegram ${tgName}${tgAssignee ? " → " + tgAssignee.slice(0, 6) : ""}`);
      }
    } catch (e) {
      results.push(`Telegram error: ${e}`);
    }
  }

  // ── MAX: check for new chats not in contacts ──
  if (source === "all" || source === "max") {
    try {
      const maxProxy = process.env.MAX_PROXY_URL;
      const maxKey = process.env.MAX_PROXY_KEY;
      if (maxProxy && maxKey) {
        const res = await fetch(`${maxProxy}/chats`, { headers: { Authorization: maxKey } }).catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          const chats = data.chats ?? [];

          for (const chat of chats) {
            const chatId = String(chat.chatId ?? "");
            const rawName = chat.title ?? "";
            const isJunkName = (n: string) => !n || /^\d+$/.test(n.trim()) || n.trim().length < 2;
            const name = isJunkName(rawName) ? "" : rawName;
            const chatPhone = chat.phone ? String(chat.phone) : null;
            if (!chatId || maksIds.has(chatId) || Number(chatId) < 0) continue;

            // Check if lead exists
            const { data: existingLead } = await admin.from("leads")
              .select("id")
              .eq("source", "maks")
              .ilike("title", `%${chatId}%`)
              .limit(1)
              .single();
            if (existingLead) { maksIds.add(chatId); continue; }

            const adminId = (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id;

            // Try to find existing contact: by maks_id, then by phone
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let existingContact: any = null;
            const { data: byMaksId } = await admin.from("contacts")
              .select("id, full_name, phone, maks_id")
              .eq("maks_id", chatId)
              .limit(1)
              .single();
            if (byMaksId) existingContact = byMaksId;

            if (!existingContact && chatPhone) {
              const cleanPhone = chatPhone.replace(/\D/g, "").slice(-10);
              if (cleanPhone.length >= 7) {
                const { data: byPhone } = await admin.from("contacts")
                  .select("id, full_name, phone, maks_id")
                  .ilike("phone", `%${cleanPhone}%`)
                  .limit(1)
                  .single();
                if (byPhone) existingContact = byPhone;
              }
            }

            let contactId: string | null = null;
            if (existingContact) {
              contactId = existingContact.id;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const upd: any = {};
              if (name && (isJunkName(existingContact.full_name) || existingContact.full_name === chatId)) upd.full_name = name;
              if (chatPhone && !existingContact.phone) upd.phone = chatPhone;
              if (chatId && !existingContact.maks_id) upd.maks_id = chatId;
              if (Object.keys(upd).length > 0) {
                await admin.from("contacts").update(upd).eq("id", contactId);
              }
            } else {
              const { data: contact } = await admin.from("contacts")
                .insert({
                  full_name: name || chatPhone || "Контакт",
                  maks_id: chatId,
                  phone: chatPhone,
                  created_by: adminId,
                })
                .select("id")
                .single();
              contactId = contact?.id ?? null;
            }

            if (contactId) {
              const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
              const { data: firstStage } = funnel
                ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single()
                : { data: null };

              const maxAssignee = await pickAutoLeadAssignee(admin);
              await admin.from("leads").insert({
                title: `МАКС: ${name}`,
                source: "maks",
                status: "new",
                contact_id: contactId,
                funnel_id: funnel?.id ?? null,
                stage_id: firstStage?.id ?? null,
                assigned_to: maxAssignee ?? null,
                created_by: adminId,
              });
              results.push(`Lead created: MAX ${name}${maxAssignee ? " → " + maxAssignee.slice(0, 6) : ""}`);
              maksIds.add(chatId);
            }
          }
        }
      }
    } catch (e) {
      results.push(`MAX error: ${e}`);
    }
  }

  // ── EMAIL: check INBOX for new senders not in contacts ──
  if (source === "all" || source === "email") {
    const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
    const imapUser = process.env.IMAP_USER || process.env.SMTP_USER;
    const imapPass = process.env.IMAP_PASS || process.env.SMTP_PASS;
    const port = Number(process.env.IMAP_PORT || 993);
    const imap = await getImapModules();

    if (host && imapUser && imapPass && imap) {
      let client: InstanceType<typeof imap.ImapFlow> | null = null;
      try {
        const emailSet = new Set((existingContacts ?? []).filter((c) => c.email).map((c) => c.email!.toLowerCase()));

        client = new imap.ImapFlow({
          host, port, secure: true,
          auth: { user: imapUser, pass: imapPass },
          logger: false,
        });
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");

        try {
          const mailbox = client.mailbox as { exists?: number } | false;
          const total = (mailbox && typeof mailbox === "object") ? (mailbox.exists ?? 0) : 0;
          if (total > 0) {
            // Check last 20 emails
            const startSeq = Math.max(1, total - 20 + 1);
            for await (const msg of client.fetch(`${startSeq}:*`, { uid: true, source: true })) {
              try {
                const parsed = await imap.simpleParser(msg.source as Buffer);
                const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase();
                const fromName = parsed.from?.value?.[0]?.name ?? parsed.from?.text ?? fromEmail ?? "";

                if (!fromEmail || fromEmail === imapUser.toLowerCase()) continue;
                if (emailSet.has(fromEmail)) continue;

                // Check if lead already exists for this email
                const { data: existingLead } = await admin.from("leads")
                  .select("id")
                  .eq("source", "email")
                  .ilike("title", `%${fromEmail}%`)
                  .limit(1)
                  .single();
                if (existingLead) { emailSet.add(fromEmail); continue; }

                // Also check contacts table directly
                const { data: existingContact } = await admin.from("contacts")
                  .select("id")
                  .ilike("email", fromEmail)
                  .limit(1)
                  .single();
                if (existingContact) { emailSet.add(fromEmail); continue; }

                const adminId = (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id;

                // Create contact
                const { data: contact } = await admin.from("contacts")
                  .insert({ full_name: fromName || fromEmail, email: fromEmail, created_by: adminId })
                  .select("id")
                  .single();

                if (contact) {
                  const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
                  const { data: firstStage } = funnel
                    ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single()
                    : { data: null };

                  const emailAssignee = await pickAutoLeadAssignee(admin);
                  await admin.from("leads").insert({
                    title: `Email: ${fromName || fromEmail}`,
                    source: "email",
                    status: "new",
                    contact_id: contact.id,
                    funnel_id: funnel?.id ?? null,
                    stage_id: firstStage?.id ?? null,
                    assigned_to: emailAssignee ?? null,
                    created_by: adminId,
                  });
                  results.push(`Lead created: Email ${fromName} <${fromEmail}>${emailAssignee ? " → " + emailAssignee.slice(0, 6) : ""}`);
                  emailSet.add(fromEmail);
                }
              } catch { /* skip individual email */ }
            }
          }
        } finally {
          lock.release();
        }
        await client.logout();
      } catch (e) {
        results.push(`Email error: ${e}`);
        if (client) try { await client.logout(); } catch { /* */ }
      }
    }
  }

  return NextResponse.json({ ok: true, results, created: results.filter((r) => r.startsWith("Lead")).length });
}

// GET for cron trigger or manual browser call — MAX only (IMAP too slow for serverless)
export async function GET() {
  const admin = createAdminClient();
  const results: string[] = [];

  try {
    const { data: existingContacts } = await admin.from("contacts").select("id, maks_id");
    const maksIds = new Set((existingContacts ?? []).filter((c) => c.maks_id).map((c) => c.maks_id));

    const isJunkName = (n: string) => !n || /^\d+$/.test(n.trim()) || n.trim().length < 2;

    const maxProxy = process.env.MAX_PROXY_URL;
    const maxKey = process.env.MAX_PROXY_KEY;
    if (maxProxy && maxKey) {
      const res = await fetch(`${maxProxy}/chats`, { headers: { Authorization: maxKey } });
      if (res.ok) {
        const data = await res.json();
        for (const chat of data.chats ?? []) {
          const chatId = String(chat.chatId ?? "");
          const rawName = chat.title ?? "";
          const name = isJunkName(rawName) ? "" : rawName;
          const chatPhone = chat.phone ? String(chat.phone) : null;
          if (!chatId || maksIds.has(chatId) || Number(chatId) < 0) continue;

          // Find existing contact: by maks_id, then by phone (cross-messenger dedup)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let existing: any = null;
          const { data: byMaksId } = await admin.from("contacts").select("id, full_name, phone, maks_id").eq("maks_id", chatId).limit(1).single();
          if (byMaksId) existing = byMaksId;
          if (!existing && chatPhone) {
            const cleanPhone = chatPhone.replace(/\D/g, "").slice(-10);
            if (cleanPhone.length >= 7) {
              const { data: byPhone } = await admin.from("contacts").select("id, full_name, phone, maks_id").ilike("phone", `%${cleanPhone}%`).limit(1).single();
              if (byPhone) existing = byPhone;
            }
          }

          const adminId = (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id;

          if (existing) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const upd: any = {};
            if (name && (isJunkName(existing.full_name) || existing.full_name === chatId)) upd.full_name = name;
            if (chatPhone && !existing.phone) upd.phone = chatPhone;
            if (chatId && !existing.maks_id) upd.maks_id = chatId;
            if (Object.keys(upd).length > 0) await admin.from("contacts").update(upd).eq("id", existing.id);
            maksIds.add(chatId);
            continue;
          }

          const { data: contact } = await admin.from("contacts").insert({
            full_name: name || chatPhone || "Контакт",
            maks_id: chatId,
            phone: chatPhone,
            created_by: adminId,
          }).select("id").single();
          if (contact) {
            const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
            const { data: firstStage } = funnel ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single() : { data: null };
            const cronAssignee = await pickAutoLeadAssignee(admin);
            await admin.from("leads").insert({ title: `МАКС: ${name || chatId}`, source: "maks", status: "new", contact_id: contact.id, funnel_id: funnel?.id ?? null, stage_id: firstStage?.id ?? null, assigned_to: cronAssignee ?? null, created_by: adminId });
            results.push(`Lead: MAX ${name || chatId}`);
            maksIds.add(chatId);
          }
        }
      }
    } else {
      results.push("MAX_PROXY_URL not configured");
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, results, created: results.filter((r) => r.startsWith("Lead")).length });
}
