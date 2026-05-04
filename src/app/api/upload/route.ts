import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file || !file.size) return NextResponse.json({ error: "file required" }, { status: 400 });

    const admin = createAdminClient();
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `uploads/${user.id}/${Date.now()}.${ext}`;
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuf));

    // Try upload
    let uploadError = null;
    const { error: err1 } = await admin.storage.from("attachments").upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
    uploadError = err1;

    // If bucket doesn't exist, create and retry
    if (uploadError && (uploadError.message?.includes("not found") || uploadError.message?.includes("Bucket"))) {
      await admin.storage.createBucket("attachments", { public: true });
      const { error: err2 } = await admin.storage.from("attachments").upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
      uploadError = err2;
    }

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: urlData } = admin.storage.from("attachments").getPublicUrl(path);
    return NextResponse.json({ url: urlData.publicUrl, name: file.name, size: file.size, type: file.type });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? String(err) }, { status: 500 });
  }
}
