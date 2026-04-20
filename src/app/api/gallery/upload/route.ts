import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const folderId = formData.get("folder_id") as string;
  if (!file || !folderId) return NextResponse.json({ error: "file and folder_id required" }, { status: 400 });

  const admin = createAdminClient();

  // Upload to Supabase storage
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fileName = `gallery/${folderId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage.from("attachments").upload(fileName, buffer, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: urlData } = admin.storage.from("attachments").getPublicUrl(fileName);

  // Save to DB
  const { data: photo, error: dbErr } = await admin.from("gallery_photos").insert({
    folder_id: folderId,
    name: file.name.replace(/\.[^.]+$/, ""),
    url: urlData.publicUrl,
    file_type: ext,
    file_size: file.size,
  }).select("*").single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json(photo);
}
