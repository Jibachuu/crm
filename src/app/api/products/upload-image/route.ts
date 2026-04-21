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
  // Unique path per upload — bypasses browser cache on replace
  const path = `products/${productId}_${Date.now()}.${ext}`;
  const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));

  const { error: upErr } = await admin.storage.from("attachments").upload(path, buffer, { contentType: file.type });
  if (upErr) {
    if (upErr.message?.includes("not found") || upErr.message?.includes("Bucket")) {
      await admin.storage.createBucket("attachments", { public: true });
      await admin.storage.from("attachments").upload(path, buffer, { contentType: file.type });
    } else {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  const { data: urlData } = admin.storage.from("attachments").getPublicUrl(path);
  // Only update product table if it's a real product (not a quote-manual placeholder)
  if (!productId.startsWith("quote-manual-")) {
    await admin.from("products").update({ image_url: urlData.publicUrl }).eq("id", productId);
  }

  return NextResponse.json({ url: urlData.publicUrl });
}
