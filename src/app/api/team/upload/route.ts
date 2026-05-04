import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { downscaleImage } from "@/lib/imageOptimize";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const toUser = formData.get("to_user") as string | null;
  const groupId = formData.get("group_id") as string | null;

  if (!file || (!toUser && !groupId)) {
    return NextResponse.json({ error: "file and (to_user or group_id) required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Downscale screenshots / phone photos before uploading. Voice messages
  // (audio/webm) and other non-image types pass through untouched.
  const original = Buffer.from(await file.arrayBuffer());
  const { buffer, contentType: outType, resized } = await downscaleImage(original, file.type || "application/octet-stream");
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const ext = outType === "image/jpeg" ? "jpg" : outType === "image/png" ? "png" : (file.name.split(".").pop() ?? "bin");
  const finalName = resized ? `${baseName}.${ext}` : file.name;
  const path = `team/${user.id}/${Date.now()}_${finalName}`;

  const { error: uploadErr } = await admin.storage
    .from("attachments")
    .upload(path, buffer, { contentType: outType, upsert: false });

  if (uploadErr) {
    if (uploadErr.message?.includes("not found") || uploadErr.message?.includes("Bucket")) {
      await admin.storage.createBucket("attachments", { public: true });
      const { error: retryErr } = await admin.storage
        .from("attachments")
        .upload(path, buffer, { contentType: outType, upsert: false });
      if (retryErr) return NextResponse.json({ error: retryErr.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }
  }

  const { data: urlData } = admin.storage.from("attachments").getPublicUrl(path);
  const fileUrl = urlData.publicUrl;

  // Save message — personal or group
  if (toUser) {
    const { data: msg, error: msgErr } = await admin
      .from("internal_messages")
      .insert({ from_user: user.id, to_user: toUser, body: null, file_url: fileUrl, file_name: finalName })
      .select("*")
      .single();
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
    return NextResponse.json({ message: msg });
  } else {
    const { data: msg, error: msgErr } = await admin
      .from("group_messages")
      .insert({ group_id: groupId, sender_id: user.id, body: null, file_url: fileUrl, file_name: finalName })
      .select("*, users:sender_id(full_name)")
      .single();
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
    return NextResponse.json({ message: msg });
  }
}
