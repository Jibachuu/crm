import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin" || profile?.role === "supervisor";

  // Update last_seen_at for online status
  await supabase.from("users").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);

  const admin = createAdminClient();
  const notifications: {
    id: string;
    type: "task" | "message" | "lead";
    title: string;
    subtitle?: string;
    link?: string;
    date: string;
  }[] = [];

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ── 1. New messages (messenger/email) on entities user is responsible for ──
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commQuery: any = admin.from("communications")
      .select("id, channel, direction, content, created_at, lead_id, deal_id, contact_id, company_id, sender_name")
      .eq("direction", "incoming")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: comms } = await commQuery;

    if (comms && comms.length > 0) {
      let allowedComms = comms;
      if (!isAdmin) {
        const leadIds = [...new Set(comms.map((c: { lead_id?: string }) => c.lead_id).filter(Boolean))];
        const dealIds = [...new Set(comms.map((c: { deal_id?: string }) => c.deal_id).filter(Boolean))];
        const contactIds = [...new Set(comms.map((c: { contact_id?: string }) => c.contact_id).filter(Boolean))];
        const companyIds = [...new Set(comms.map((c: { company_id?: string }) => c.company_id).filter(Boolean))];

        const ownLeads = leadIds.length ? (await admin.from("leads").select("id").in("id", leadIds).eq("assigned_to", user.id)).data?.map((r) => r.id) ?? [] : [];
        const ownDeals = dealIds.length ? (await admin.from("deals").select("id").in("id", dealIds).eq("assigned_to", user.id)).data?.map((r) => r.id) ?? [] : [];
        const ownContacts = contactIds.length ? (await admin.from("contacts").select("id").in("id", contactIds).eq("assigned_to", user.id)).data?.map((r) => r.id) ?? [] : [];
        const ownCompanies = companyIds.length ? (await admin.from("companies").select("id").in("id", companyIds).eq("assigned_to", user.id)).data?.map((r) => r.id) ?? [] : [];

        allowedComms = comms.filter((c: { lead_id?: string; deal_id?: string; contact_id?: string; company_id?: string }) =>
          (c.lead_id && new Set(ownLeads).has(c.lead_id)) ||
          (c.deal_id && new Set(ownDeals).has(c.deal_id)) ||
          (c.contact_id && new Set(ownContacts).has(c.contact_id)) ||
          (c.company_id && new Set(ownCompanies).has(c.company_id))
        );
      }

      // Enrich with contact names
      const contactIdsForName = [...new Set(allowedComms.map((c: { contact_id?: string }) => c.contact_id).filter(Boolean))];
      const contactNameMap = new Map<string, { full_name: string; company_id?: string }>();
      const compNameMap = new Map<string, string>();
      if (contactIdsForName.length > 0) {
        const { data: contactRows } = await admin.from("contacts").select("id, full_name, company_id").in("id", contactIdsForName);
        for (const ct of contactRows ?? []) contactNameMap.set(ct.id, ct);
        const compIds = [...new Set((contactRows ?? []).map((c) => c.company_id).filter(Boolean))];
        if (compIds.length > 0) {
          const { data: compRows } = await admin.from("companies").select("id, name").in("id", compIds);
          for (const co of compRows ?? []) compNameMap.set(co.id, co.name);
        }
      }

      const channelLabels: Record<string, string> = { email: "Почта", telegram: "Telegram", maks: "МАКС", whatsapp: "WhatsApp", phone: "Звонок" };
      for (const c of allowedComms) {
        const channelLabel = channelLabels[String(c.channel)] || String(c.channel || "Сообщение");
        const target = `/inbox?tab=all`;
        const contact = c.contact_id ? contactNameMap.get(c.contact_id) : undefined;
        const contactName = contact?.full_name;
        const companyName = contact?.company_id ? compNameMap.get(contact.company_id) : undefined;
        const senderDisplay = contactName
          ? (companyName ? `${contactName} · ${companyName}` : contactName)
          : (c.sender_name || "новое сообщение");

        notifications.push({
          id: `comm-${c.id}`,
          type: "message",
          title: `${channelLabel}: ${senderDisplay}`,
          subtitle: c.content ? String(c.content).slice(0, 80) : undefined,
          link: target,
          date: c.created_at,
        });
      }
    }
  } catch { /* ignore */ }

  // ── 2. New leads assigned to user (last 24h) ──
  try {
    let leadQuery = admin.from("leads")
      .select("id, title, source, created_at, contacts(full_name), companies(name)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!isAdmin) {
      leadQuery = leadQuery.eq("assigned_to", user.id);
    }

    const { data: newLeads } = await leadQuery;
    for (const lead of newLeads ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contactName = (lead.contacts as any)?.full_name;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const companyName = (lead.companies as any)?.name;
      const sourceLabel = lead.source === "website" ? "с сайта" : lead.source === "telegram" ? "из Telegram" : lead.source === "maks" ? "из МАКС" : lead.source === "email" ? "из почты" : "";
      notifications.push({
        id: `lead-${lead.id}`,
        type: "lead",
        title: `Новый лид${sourceLabel ? ` ${sourceLabel}` : ""}: ${lead.title}`,
        subtitle: [contactName, companyName].filter(Boolean).join(" · ") || undefined,
        link: `/leads/${lead.id}`,
        date: lead.created_at,
      });
    }
  } catch { /* ignore */ }

  // ── 3. Internal personal messages (DMs) ──
  try {
    const { data: dms } = await admin
      .from("internal_messages")
      .select("id, from_user, body, created_at, users!internal_messages_from_user_fkey(full_name)")
      .eq("to_user", user.id)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(20);

    for (const m of dms ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fromName = (m.users as any)?.full_name ?? "Сотрудник";
      notifications.push({
        id: `dm-${m.id}`,
        type: "message",
        title: `Личное: ${fromName}`,
        subtitle: m.body ? String(m.body).slice(0, 80) : "Файл",
        link: `/team?peer=${m.from_user}`,
        date: m.created_at,
      });
    }
  } catch { /* ignore */ }

  // ── 4. Group chat messages ──
  try {
    const { data: memberships } = await admin
      .from("group_chat_members")
      .select("group_id")
      .eq("user_id", user.id);

    const groupIds = (memberships ?? []).map((m) => m.group_id);
    if (groupIds.length > 0) {
      const { data: reads } = await admin
        .from("group_chat_reads")
        .select("group_id, last_read_at")
        .eq("user_id", user.id)
        .in("group_id", groupIds);
      const readsMap = new Map((reads ?? []).map((r) => [r.group_id, r.last_read_at]));

      const { data: groupMsgs } = await admin
        .from("group_messages")
        .select("id, group_id, sender_id, body, created_at, group_chats(name), users(full_name)")
        .in("group_id", groupIds)
        .neq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      for (const m of groupMsgs ?? []) {
        const lastRead = readsMap.get(m.group_id);
        if (lastRead && new Date(m.created_at) <= new Date(lastRead)) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groupName = (m.group_chats as any)?.name ?? "Группа";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const senderName = (m.users as any)?.full_name ?? "Сотрудник";
        notifications.push({
          id: `gm-${m.id}`,
          type: "message",
          title: `${groupName}: ${senderName}`,
          subtitle: m.body ? String(m.body).slice(0, 80) : "Файл",
          link: `/team?group=${m.group_id}`,
          date: m.created_at,
        });
      }
    }
  } catch { /* ignore */ }

  // Sort by date, newest first
  notifications.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({ notifications, count: notifications.length });
}
