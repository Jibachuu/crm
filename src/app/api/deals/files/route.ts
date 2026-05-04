import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeStorageName } from "@/lib/safeFilename";

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
  const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
  // Storage path must be ASCII-safe so Supabase doesn't reject "№" /
  // cyrillic with "Invalid key" (seen 2026-05-04). DB row keeps the
  // original human-readable name for display.
  const path = `${folder}/${entityId}/${Date.now()}_${safeStorageName(file.name)}`;

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
    deal_id: dealId || null,
    lead_id: leadId || null,
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
