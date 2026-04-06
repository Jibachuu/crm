import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Get groups where user is a member
  const { data: memberships } = await admin
    .from("group_chat_members")
    .select("group_id")
    .eq("user_id", user.id);

  const groupIds = (memberships ?? []).map((m) => m.group_id);
  if (groupIds.length === 0) return NextResponse.json({ groups: [], unreadMap: {} });

  // Get group details with member count
  const { data: groups } = await admin
    .from("group_chats")
    .select("*, group_chat_members(user_id, users(id, full_name))")
    .in("id", groupIds)
    .order("created_at", { ascending: false });

  // Get unread counts
  const { data: reads } = await admin
    .from("group_chat_reads")
    .select("group_id, last_read_at")
    .eq("user_id", user.id);

  const readMap = new Map((reads ?? []).map((r) => [r.group_id, r.last_read_at]));
  const unreadMap: Record<string, number> = {};

  for (const gid of groupIds) {
    const lastRead = readMap.get(gid) ?? "1970-01-01T00:00:00Z";
    const { count } = await admin
      .from("group_messages")
      .select("*", { count: "exact", head: true })
      .eq("group_id", gid)
      .gt("created_at", lastRead)
      .neq("sender_id", user.id);
    if (count && count > 0) unreadMap[gid] = count;
  }

  return NextResponse.json({ groups: groups ?? [], unreadMap });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  const admin = createAdminClient();

  // Create group
  if (action === "create") {
    const { name, memberIds } = body as { name: string; memberIds: string[] };
    if (!name?.trim()) return NextResponse.json({ error: "Название обязательно" }, { status: 400 });

    const { data: group, error } = await admin
      .from("group_chats")
      .insert({ name, created_by: user.id })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Add creator + selected members
    const allMembers = new Set([user.id, ...(memberIds ?? [])]);
    await admin.from("group_chat_members").insert(
      [...allMembers].map((uid) => ({ group_id: group.id, user_id: uid }))
    );

    return NextResponse.json({ group });
  }

  // Get messages
  if (action === "messages") {
    const { group_id } = body;
    const { data: messages } = await admin
      .from("group_messages")
      .select("*, users:sender_id(full_name)")
      .eq("group_id", group_id)
      .order("created_at", { ascending: true })
      .limit(200);

    // Mark as read
    await admin.from("group_chat_reads").upsert(
      { group_id, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: "group_id,user_id" }
    );

    return NextResponse.json({ messages: messages ?? [] });
  }

  // Send message
  if (action === "send") {
    const { group_id, text, file_url, file_name } = body;
    if (!group_id) return NextResponse.json({ error: "group_id required" }, { status: 400 });
    if (!text?.trim() && !file_url) return NextResponse.json({ error: "Сообщение пустое" }, { status: 400 });

    const { data: msg, error } = await admin
      .from("group_messages")
      .insert({ group_id, sender_id: user.id, body: text?.trim() || null, file_url: file_url || null, file_name: file_name || null })
      .select("*, users:sender_id(full_name)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Update read marker for sender
    await admin.from("group_chat_reads").upsert(
      { group_id, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: "group_id,user_id" }
    );

    return NextResponse.json({ message: msg });
  }

  // Add/remove members
  if (action === "add_member") {
    const { group_id, user_id: targetId } = body;
    await admin.from("group_chat_members").insert({ group_id, user_id: targetId });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove_member") {
    const { group_id, user_id: targetId } = body;
    await admin.from("group_chat_members").delete().eq("group_id", group_id).eq("user_id", targetId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
