import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const companyId = formData.get("company_id") as string;
  const file = formData.get("file") as File | null;

  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const admin = createAdminClient();

  if (file && file.size > 0) {
    const ext = file.name.split(".").pop() ?? "pdf";
    const path = `contracts/${companyId}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));

    const { error: uploadErr } = await admin.storage
      .from("attachments")
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadErr) {
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

    await admin.from("companies").update({
      contract_file_url: urlData.publicUrl,
      contract_file_name: file.name,
    }).eq("id", companyId);

    return NextResponse.json({ url: urlData.publicUrl, name: file.name });
  }

  return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
}
