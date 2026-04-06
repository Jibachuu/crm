import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const peerId = searchParams.get("peer");

  if (peerId) {
    // Fetch messages between current user and peer
    const { data } = await supabase
      .from("internal_messages")
      .select("*")
      .or(`and(from_user.eq.${user.id},to_user.eq.${peerId}),and(from_user.eq.${peerId},to_user.eq.${user.id})`)
      .order("created_at", { ascending: true })
      .limit(200);

    // Mark unread messages as read
    await supabase
      .from("internal_messages")
      .update({ is_read: true })
      .eq("from_user", peerId)
      .eq("to_user", user.id)
      .eq("is_read", false);

    return NextResponse.json({ messages: data ?? [] });
  }

  // Fetch unread counts per user
  const { data: unread } = await supabase
    .from("internal_messages")
    .select("from_user")
    .eq("to_user", user.id)
    .eq("is_read", false);

  const unreadMap: Record<string, number> = {};
  for (const m of unread ?? []) {
    unreadMap[m.from_user] = (unreadMap[m.from_user] ?? 0) + 1;
  }

  return NextResponse.json({ unreadMap });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { to_user, body, file_url, file_name } = await req.json();
  if (!to_user || (!body?.trim() && !file_url)) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("internal_messages")
    .insert({
      from_user: user.id,
      to_user,
      body: body?.trim() || null,
      file_url: file_url || null,
      file_name: file_name || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data });
}
