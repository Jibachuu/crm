import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // Get current open session for this user
  if (action === "status") {
    const { data } = await supabase
      .from("time_entries")
      .select("id, check_in")
      .eq("user_id", user.id)
      .is("check_out", null)
      .order("check_in", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({ active: !!data, entry: data });
  }

  // Get all entries for a date range (admin view)
  if (action === "list") {
    const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const userId = searchParams.get("user_id");

    let q = supabase
      .from("time_entries")
      .select("*, users(full_name)")
      .gte("check_in", date + "T00:00:00")
      .lte("check_in", date + "T23:59:59")
      .order("check_in", { ascending: false });

    if (userId) q = q.eq("user_id", userId);

    const { data } = await q;
    return NextResponse.json({ entries: data ?? [] });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action } = await req.json();

  if (action === "check_in") {
    // Close any open session first
    const { data: open } = await supabase
      .from("time_entries")
      .select("id, check_in")
      .eq("user_id", user.id)
      .is("check_out", null)
      .limit(1)
      .single();

    if (open) {
      return NextResponse.json({ error: "Already checked in", entry: open }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("time_entries")
      .insert({ user_id: user.id })
      .select("id, check_in")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entry: data });
  }

  if (action === "check_out") {
    const { data: open } = await supabase
      .from("time_entries")
      .select("id, check_in")
      .eq("user_id", user.id)
      .is("check_out", null)
      .order("check_in", { ascending: false })
      .limit(1)
      .single();

    if (!open) return NextResponse.json({ error: "Not checked in" }, { status: 400 });

    const now = new Date();
    const checkIn = new Date(open.check_in);
    const durationMinutes = Math.round((now.getTime() - checkIn.getTime()) / 60000);

    const { data, error } = await supabase
      .from("time_entries")
      .update({ check_out: now.toISOString(), duration_minutes: durationMinutes })
      .eq("id", open.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entry: data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
