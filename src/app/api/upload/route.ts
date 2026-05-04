import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { downscaleImage } from "@/lib/imageOptimize";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file || !file.size) return NextResponse.json({ error: "file required" }, { status: 400 });

    const admin = createAdminClient();
    const original = Buffer.from(new Uint8Array(await file.arrayBuffer()));

    // Downscale large images before upload — keeps screenshots / phone
    // photos from blowing through Supabase Storage egress.
    const { buffer, contentType: outType, resized } = await downscaleImage(original, file.type || "application/octet-stream");
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const ext = outType === "image/jpeg" ? "jpg" : outType === "image/png" ? "png" : (file.name.split(".").pop() ?? "bin");
    const finalName = resized ? `${baseName}.${ext}` : file.name;
    const path = `uploads/${user.id}/${Date.now()}_${finalName}`;

    let uploadError = null;
    const { error: err1 } = await admin.storage.from("attachments").upload(path, buffer, { contentType: outType, upsert: true });
    uploadError = err1;

    if (uploadError && (uploadError.message?.includes("not found") || uploadError.message?.includes("Bucket"))) {
      await admin.storage.createBucket("attachments", { public: true });
      const { error: err2 } = await admin.storage.from("attachments").upload(path, buffer, { contentType: outType, upsert: true });
      uploadError = err2;
    }

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: urlData } = admin.storage.from("attachments").getPublicUrl(path);
    return NextResponse.json({ url: urlData.publicUrl, name: finalName, size: buffer.byteLength, type: outType, originalSize: original.byteLength, resized });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? String(err) }, { status: 500 });
  }
}
