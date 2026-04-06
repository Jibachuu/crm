import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const field = formData.get("field") as string; // "stamp_url" or "signature_url"

  if (!file || !field) return NextResponse.json({ error: "file and field required" }, { status: 400 });

  const admin = createAdminClient();
  const ext = file.name.split(".").pop() ?? "png";
  const path = `supplier/${field}_${Date.now()}.${ext}`;
  const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));

  // Upload
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
  const publicUrl = urlData.publicUrl;

  // Update supplier settings
  const { data: existing } = await admin.from("supplier_settings").select("id").limit(1).single();
  if (existing) {
    await admin.from("supplier_settings").update({ [field]: publicUrl }).eq("id", existing.id);
  }

  return NextResponse.json({ url: publicUrl });
}
