import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const toUser = formData.get("to_user") as string;

  if (!file || !toUser) {
    return NextResponse.json({ error: "file and to_user required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Upload to Supabase Storage
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `team/${user.id}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from("attachments")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) {
    // If bucket doesn't exist, create it
    if (uploadErr.message?.includes("not found") || uploadErr.message?.includes("Bucket")) {
      await admin.storage.createBucket("attachments", { public: true });
      const { error: retryErr } = await admin.storage
        .from("attachments")
        .upload(path, buffer, { contentType: file.type, upsert: false });
      if (retryErr) return NextResponse.json({ error: retryErr.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }
  }

  const { data: urlData } = admin.storage.from("attachments").getPublicUrl(path);
  const fileUrl = urlData.publicUrl;

  // Save message with file
  const { data: msg, error: msgErr } = await admin
    .from("internal_messages")
    .insert({
      from_user: user.id,
      to_user: toUser,
      body: null,
      file_url: fileUrl,
      file_name: file.name,
    })
    .select("*")
    .single();

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
  return NextResponse.json({ message: msg });
}
