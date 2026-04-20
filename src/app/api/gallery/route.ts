import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  const admin = createAdminClient();

  // Folders
  if (action === "create_folder") {
    const { name, description } = body;
    const { data, error } = await admin.from("gallery_folders").insert({ name, description: description || null }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "update_folder") {
    const { id, name, description } = body;
    await admin.from("gallery_folders").update({ name, description: description || null }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_folder") {
    const { id } = body;
    await admin.from("gallery_photos").delete().eq("folder_id", id);
    await admin.from("gallery_folders").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  // Photos
  if (action === "update_photo") {
    const { id, name, description } = body;
    const updates: Record<string, string | null> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description || null;
    await admin.from("gallery_photos").update(updates).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_photo") {
    const { id } = body;
    await admin.from("gallery_photos").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
