import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  const admin = createAdminClient();
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `uploads/${user.id}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));

  const { error: upErr } = await admin.storage.from("attachments").upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) {
    if (upErr.message?.includes("not found") || upErr.message?.includes("Bucket")) {
      await admin.storage.createBucket("attachments", { public: true });
      await admin.storage.from("attachments").upload(path, buffer, { contentType: file.type, upsert: false });
    } else {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  const { data: urlData } = admin.storage.from("attachments").getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl, name: file.name });
}
