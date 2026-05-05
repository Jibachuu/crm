import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeStorageName } from "@/lib/safeFilename";

// Multi-file contract storage on companies (request 2026-05-05).
// Files live in JSONB array `contract_files`; legacy single-file
// columns (contract_file_url / _name) are kept in sync with the
// LAST uploaded file so PDF generators / templates that still read
// them keep working.

interface ContractFile {
  url: string;
  name: string;
  uploaded_at: string;
  signed_at?: string;
  status?: string;
  comment?: string;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("companies")
    .select("contract_files")
    .eq("id", companyId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const files: ContractFile[] = Array.isArray(data?.contract_files) ? data.contract_files : [];
  return NextResponse.json({ files });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const companyId = formData.get("company_id") as string;
  const file = formData.get("file") as File | null;
  const signedAt = (formData.get("signed_at") as string) || "";
  const status = (formData.get("status") as string) || "";
  const comment = (formData.get("comment") as string) || "";

  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });
  if (!file || !file.size) return NextResponse.json({ error: "Файл не передан" }, { status: 400 });

  const admin = createAdminClient();

  const path = `contracts/${companyId}/${Date.now()}_${safeStorageName(file.name)}`;
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

  const { data: company } = await admin
    .from("companies")
    .select("contract_files")
    .eq("id", companyId)
    .single();
  const existing: ContractFile[] = Array.isArray(company?.contract_files) ? company!.contract_files : [];

  const newFile: ContractFile = { url: urlData.publicUrl, name: file.name, uploaded_at: new Date().toISOString() };
  if (signedAt) newFile.signed_at = signedAt;
  if (status) newFile.status = status;
  if (comment) newFile.comment = comment;

  const next = [...existing, newFile];

  const legacyUpdate: Record<string, unknown> = {
    contract_files: next,
    contract_file_url: newFile.url,
    contract_file_name: newFile.name,
  };
  if (signedAt) legacyUpdate.contract_signed_at = signedAt;
  if (status) legacyUpdate.contract_status = status;
  if (comment) legacyUpdate.contract_comment = comment;

  const { error: updErr } = await admin.from("companies").update(legacyUpdate).eq("id", companyId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ file: newFile, files: next });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { company_id, url } = await req.json();
  if (!company_id || !url) return NextResponse.json({ error: "company_id and url required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select("contract_files")
    .eq("id", company_id)
    .single();
  const existing: ContractFile[] = Array.isArray(company?.contract_files) ? company!.contract_files : [];
  const next = existing.filter((f) => f.url !== url);

  // Best-effort delete of the storage object so we don't accumulate
  // orphans. Path is the part after /attachments/ in the public URL.
  try {
    const m = url.match(/\/attachments\/(.+)$/);
    if (m && m[1]) await admin.storage.from("attachments").remove([decodeURIComponent(m[1])]);
  } catch { /* ignore */ }

  const lastFile = next[next.length - 1] ?? null;
  const update: Record<string, unknown> = {
    contract_files: next,
    contract_file_url: lastFile?.url ?? null,
    contract_file_name: lastFile?.name ?? null,
  };
  const { error } = await admin.from("companies").update(update).eq("id", company_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, files: next });
}
