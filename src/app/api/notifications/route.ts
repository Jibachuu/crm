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

  // Admin sees ALL tasks, others see only their own
  const admin = createAdminClient();
  let query = admin.from("tasks")
    .select("id, title, due_date, status, entity_type, entity_id, created_at, assigned_to, users!tasks_assigned_to_fkey(full_name)")
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (!isAdmin) {
    query = query.eq("assigned_to", user.id);
  }

  const { data: tasks } = await query;

  const notifications: {
    id: string;
    type: "task" | "message";
    title: string;
    subtitle?: string;
    link?: string;
    date: string;
  }[] = [];

  const today = new Date().toISOString().slice(0, 10);

  for (const t of tasks ?? []) {
    const dueDate = t.due_date ? new Date(t.due_date) : null;
    const isOverdue = dueDate && dueDate < new Date() && t.due_date.slice(0, 10) < today;
    const isToday = t.due_date && t.due_date.slice(0, 10) === today;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assigneeName = isAdmin && t.assigned_to !== user.id ? ` (${(t.users as any)?.full_name ?? ""})` : "";
    const prefix = isOverdue ? "Просрочена" : isToday ? "Сегодня" : "";
    notifications.push({
      id: `task-${t.id}`,
      type: "task",
      title: prefix ? `${prefix}: ${t.title}${assigneeName}` : `${t.title}${assigneeName}`,
      subtitle: t.due_date ? `Срок: ${new Date(t.due_date).toLocaleDateString("ru-RU")}` : undefined,
      link: t.entity_type && t.entity_id ? `/${t.entity_type}s/${t.entity_id}` : "/tasks",
      date: t.created_at,
    });
  }

  // ── Communications: new messages in the last 24h on entities the user is responsible for ──
  // Admin sees all incoming messages; others only see messages on their own leads/deals/contacts/companies
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let commQuery: any = admin.from("communications")
    .select("id, channel, direction, content, created_at, lead_id, deal_id, contact_id, company_id, sender_name")
    .eq("direction", "incoming")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: comms } = await commQuery;

  if (comms && comms.length > 0) {
    // Filter by responsibility (skip filter for admins)
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

      const ownLeadsSet = new Set(ownLeads);
      const ownDealsSet = new Set(ownDeals);
      const ownContactsSet = new Set(ownContacts);
      const ownCompaniesSet = new Set(ownCompanies);

      allowedComms = comms.filter((c: { lead_id?: string; deal_id?: string; contact_id?: string; company_id?: string }) =>
        (c.lead_id && ownLeadsSet.has(c.lead_id)) ||
        (c.deal_id && ownDealsSet.has(c.deal_id)) ||
        (c.contact_id && ownContactsSet.has(c.contact_id)) ||
        (c.company_id && ownCompaniesSet.has(c.company_id))
      );
    }

    const channelLabels: Record<string, string> = { email: "Почта", telegram: "Telegram", maks: "МАКС", whatsapp: "WhatsApp", phone: "Звонок" };
    for (const c of allowedComms) {
      const channelLabel = channelLabels[String(c.channel)] || String(c.channel || "Сообщение");
      const target = c.lead_id ? `/leads/${c.lead_id}` : c.deal_id ? `/deals/${c.deal_id}` : c.contact_id ? `/contacts/${c.contact_id}` : c.company_id ? `/companies/${c.company_id}` : "/inbox";
      notifications.push({
        id: `comm-${c.id}`,
        type: "message",
        title: `${channelLabel}: ${c.sender_name || "новое сообщение"}`,
        subtitle: c.content ? String(c.content).slice(0, 80) : undefined,
        link: target,
        date: c.created_at,
      });
    }
  }

  // ── Internal personal chat: unread messages addressed to current user ──
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

  // ── Group team chat: unread messages in groups where user is a member ──
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

  // Sort: overdue first, then today, then rest, then messages newest-first
  notifications.sort((a, b) => {
    const aOverdue = a.title.startsWith("Просрочена") ? 0 : a.title.startsWith("Сегодня") ? 1 : 2;
    const bOverdue = b.title.startsWith("Просрочена") ? 0 : b.title.startsWith("Сегодня") ? 1 : 2;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return NextResponse.json({ notifications, count: notifications.length });
}
