import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { downscaleImage } from "@/lib/imageOptimize";

// POST /api/admin/storage/optimize
// Body: { dryRun?: boolean, limit?: number, minSizeBytes?: number, bucket?: string }
//
// Walks storage.objects, finds oversized images, and re-uploads a
// downscaled version to the SAME path so existing image_url references
// in the DB stay valid. Preserves the original encoding (PNG → PNG,
// JPEG → JPEG) so content-type / extension don't drift.
//
// Admin only. Run multiple times if needed (each call processes up to
// `limit` objects, default 25, sorted by size desc).
//
// Returns a per-file diff so the operator can see what shrunk.

interface FileResult {
  path: string;
  bucket: string;
  beforeBytes: number;
  afterBytes: number | null;
  saved: number;
  status: "shrunk" | "skipped" | "error" | "would-shrink";
  reason?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Admin only — operation rewrites public storage and could mangle
  // images for everyone if invoked carelessly.
  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = !!body.dryRun;
  const limit: number = Math.min(Math.max(Number(body.limit) || 25, 1), 200);
  const minSize: number = Math.max(Number(body.minSizeBytes) || 500_000, 200_000);
  const bucket: string = String(body.bucket || "attachments");

  // Pull metadata for every object in the bucket. storage.objects is a
  // postgres table — querying directly is reliable. metadata->>'size'
  // is the upload-reported size; mimetype lives at metadata->>'mimetype'.
  const { data: rows, error: listErr } = await admin
    .schema("storage")
    .from("objects")
    .select("name, bucket_id, metadata")
    .eq("bucket_id", bucket)
    .order("created_at", { ascending: false });

  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  // Filter to oversized images and rank by size descending so each call
  // hits the heaviest files first.
  const candidates = (rows ?? [])
    .map((r) => ({
      name: r.name as string,
      mimetype: ((r.metadata as Record<string, unknown> | null)?.mimetype as string | undefined) ?? "",
      size: Number((r.metadata as Record<string, unknown> | null)?.size ?? 0),
    }))
    .filter((r) => r.mimetype.startsWith("image/") && r.size >= minSize)
    .sort((a, b) => b.size - a.size)
    .slice(0, limit);

  const results: FileResult[] = [];
  let totalSaved = 0;
  let processed = 0;

  for (const c of candidates) {
    processed++;
    try {
      const { data: blob, error: dlErr } = await admin.storage.from(bucket).download(c.name);
      if (dlErr || !blob) {
        results.push({ path: c.name, bucket, beforeBytes: c.size, afterBytes: null, saved: 0, status: "error", reason: dlErr?.message || "download failed" });
        continue;
      }
      const original = Buffer.from(await blob.arrayBuffer());
      const { buffer: shrunk, resized, contentType } = await downscaleImage(original, c.mimetype, { preserveFormat: true });

      if (!resized || shrunk.byteLength >= original.byteLength) {
        results.push({ path: c.name, bucket, beforeBytes: original.byteLength, afterBytes: shrunk.byteLength, saved: 0, status: "skipped", reason: "no win" });
        continue;
      }

      const saved = original.byteLength - shrunk.byteLength;

      if (dryRun) {
        results.push({ path: c.name, bucket, beforeBytes: original.byteLength, afterBytes: shrunk.byteLength, saved, status: "would-shrink" });
        totalSaved += saved;
        continue;
      }

      // Upsert at the SAME path so all existing image_url / file_url
      // references stay valid. content-type stays identical because
      // preserveFormat is on.
      const { error: upErr } = await admin.storage
        .from(bucket)
        .upload(c.name, shrunk, { contentType, upsert: true });
      if (upErr) {
        results.push({ path: c.name, bucket, beforeBytes: original.byteLength, afterBytes: shrunk.byteLength, saved: 0, status: "error", reason: upErr.message });
        continue;
      }

      results.push({ path: c.name, bucket, beforeBytes: original.byteLength, afterBytes: shrunk.byteLength, saved, status: "shrunk" });
      totalSaved += saved;
    } catch (e) {
      results.push({ path: c.name, bucket, beforeBytes: c.size, afterBytes: null, saved: 0, status: "error", reason: (e as Error).message });
    }
  }

  return NextResponse.json({
    bucket,
    dryRun,
    candidatesTotal: candidates.length,
    processed,
    totalSaved,
    totalSavedHuman: humanBytes(totalSaved),
    files: results,
  });
}

// Optional GET preview — same listing, no writes. Lets the user see
// what's pending and how much space would be freed without touching
// the bucket.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const bucket = searchParams.get("bucket") || "attachments";
  const minSize = Math.max(Number(searchParams.get("minSizeBytes")) || 500_000, 200_000);

  const { data: rows, error } = await admin
    .schema("storage")
    .from("objects")
    .select("name, bucket_id, metadata, created_at")
    .eq("bucket_id", bucket);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const heavy = (rows ?? [])
    .map((r) => ({
      name: r.name as string,
      mimetype: ((r.metadata as Record<string, unknown> | null)?.mimetype as string | undefined) ?? "",
      size: Number((r.metadata as Record<string, unknown> | null)?.size ?? 0),
      created_at: r.created_at as string,
    }))
    .filter((r) => r.mimetype.startsWith("image/") && r.size >= minSize)
    .sort((a, b) => b.size - a.size);

  return NextResponse.json({
    bucket,
    minSize,
    count: heavy.length,
    totalBytes: heavy.reduce((s, r) => s + r.size, 0),
    totalHuman: humanBytes(heavy.reduce((s, r) => s + r.size, 0)),
    files: heavy.slice(0, 50),
  });
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
