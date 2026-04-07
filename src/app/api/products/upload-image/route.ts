import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const productId = formData.get("product_id") as string;
  if (!file || !productId) return NextResponse.json({ error: "file and product_id required" }, { status: 400 });

  const admin = createAdminClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `products/${productId}.${ext}`;
  const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));

  // Delete old if exists
  await admin.storage.from("attachments").remove([path]);

  const { error: upErr } = await admin.storage.from("attachments").upload(path, buffer, { contentType: file.type, upsert: true });
  if (upErr) {
    if (upErr.message?.includes("not found") || upErr.message?.includes("Bucket")) {
      await admin.storage.createBucket("attachments", { public: true });
      await admin.storage.from("attachments").upload(path, buffer, { contentType: file.type, upsert: true });
    } else {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  const { data: urlData } = admin.storage.from("attachments").getPublicUrl(path);
  await admin.from("products").update({ image_url: urlData.publicUrl }).eq("id", productId);

  return NextResponse.json({ url: urlData.publicUrl });
}
