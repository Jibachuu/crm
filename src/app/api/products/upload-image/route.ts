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
  const productId = formData.get("product_id") as string;
  if (!file || !productId) return NextResponse.json({ error: "file and product_id required" }, { status: 400 });

  const admin = createAdminClient();
  const original = Buffer.from(new Uint8Array(await file.arrayBuffer()));

  // Downscale before upload — 6 MB product PNGs were burning the monthly
  // Supabase egress quota every time the products page rendered.
  const { buffer, contentType: outType, resized } = await downscaleImage(original, file.type || "image/png");
  const ext = outType === "image/jpeg" ? "jpg" : outType === "image/png" ? "png" : (file.name.split(".").pop() ?? "jpg");

  // Unique path per upload — bypasses browser cache on replace.
  const path = `products/${productId}_${Date.now()}.${ext}`;

  const { error: upErr } = await admin.storage.from("attachments").upload(path, buffer, { contentType: outType });
  if (upErr) {
    if (upErr.message?.includes("not found") || upErr.message?.includes("Bucket")) {
      await admin.storage.createBucket("attachments", { public: true });
      await admin.storage.from("attachments").upload(path, buffer, { contentType: outType });
    } else {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  const { data: urlData } = admin.storage.from("attachments").getPublicUrl(path);
  // Only update product table if it's a real product (not a quote-manual placeholder)
  if (!productId.startsWith("quote-manual-")) {
    await admin.from("products").update({ image_url: urlData.publicUrl }).eq("id", productId);
  }

  return NextResponse.json({
    url: urlData.publicUrl,
    bytes: buffer.byteLength,
    originalBytes: original.byteLength,
    resized,
  });
}
