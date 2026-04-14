import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = new URL(req.url).searchParams.get("deal_id");
  if (!dealId) return NextResponse.json({ error: "deal_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin.from("deal_files").select("*").eq("deal_id", dealId).order("created_at", { ascending: false });
  return NextResponse.json({ files: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const dealId = formData.get("deal_id") as string;
  if (!file || !dealId) return NextResponse.json({ error: "file and deal_id required" }, { status: 400 });

  const admin = createAdminClient();
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `deals/${dealId}/${Date.now()}_${file.name}`;
  const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));

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

  const { data, error } = await admin.from("deal_files").insert({
    deal_id: dealId,
    file_name: file.name,
    file_url: urlData.publicUrl,
    file_type: file.type,
    file_size: file.size,
    uploaded_by: user.id,
  }).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("deal_files").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
