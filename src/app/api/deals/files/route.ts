import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { downscaleImage } from "@/lib/imageOptimize";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("deal_id");
  const leadId = searchParams.get("lead_id");
  if (!dealId && !leadId) return NextResponse.json({ error: "deal_id or lead_id required" }, { status: 400 });

  const admin = createAdminClient();
  let query = admin.from("deal_files").select("*").order("created_at", { ascending: false });
  if (dealId) query = query.eq("deal_id", dealId);
  else query = query.eq("lead_id", leadId);
  const { data } = await query;
  return NextResponse.json({ files: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const dealId = formData.get("deal_id") as string | null;
  const leadId = formData.get("lead_id") as string | null;
  if (!file || (!dealId && !leadId)) return NextResponse.json({ error: "file and (deal_id or lead_id) required" }, { status: 400 });

  const admin = createAdminClient();
  const entityId = dealId || leadId!;
  const folder = dealId ? "deals" : "leads";
  const original = Buffer.from(new Uint8Array(await file.arrayBuffer()));

  // Downscale screenshots before storing on the deal/lead. Audio/PDF/etc.
  // are passed through unchanged by downscaleImage.
  const { buffer, contentType: outType, resized } = await downscaleImage(original, file.type || "application/octet-stream");
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const ext = outType === "image/jpeg" ? "jpg" : outType === "image/png" ? "png" : (file.name.split(".").pop() ?? "bin");
  const finalName = resized ? `${baseName}.${ext}` : file.name;
  const path = `${folder}/${entityId}/${Date.now()}_${finalName}`;

  const { error: upErr } = await admin.storage.from("attachments").upload(path, buffer, { contentType: outType, upsert: true });
  if (upErr) {
    if (upErr.message?.includes("not found") || upErr.message?.includes("Bucket")) {
      await admin.storage.createBucket("attachments", { public: true });
      await admin.storage.from("attachments").upload(path, buffer, { contentType: outType, upsert: true });
    } else {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  const { data: urlData } = admin.storage.from("attachments").getPublicUrl(path);

  const { data, error } = await admin.from("deal_files").insert({
    deal_id: dealId || null,
    lead_id: leadId || null,
    file_name: finalName,
    file_url: urlData.publicUrl,
    file_type: outType,
    file_size: buffer.byteLength,
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
