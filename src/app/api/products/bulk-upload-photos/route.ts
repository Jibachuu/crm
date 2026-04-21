import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import JSZip from "jszip";

export const maxDuration = 300;

// Normalize string for fuzzy matching: lowercase, remove spaces/punctuation
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.,/\\()\[\]]+/g, "");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

    const admin = createAdminClient();

    // Load all products for matching
    const { data: products } = await admin.from("products").select("id, name, sku");
    if (!products) return NextResponse.json({ error: "Failed to load products" }, { status: 500 });

    // Build lookup maps
    const bySku = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const p of products) {
      if (p.sku) bySku.set(norm(p.sku), p.id);
      if (p.name) byName.set(norm(p.name), p.id);
    }

    // Unzip file
    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);

    const matched: Array<{ filename: string; productId: string; productName: string }> = [];
    const unmatched: string[] = [];
    let uploaded = 0;

    // Process each image file in ZIP
    const entries = Object.values(zip.files).filter((f) => !f.dir);

    for (const entry of entries) {
      const filename = entry.name.split("/").pop() || entry.name;
      const ext = filename.split(".").pop()?.toLowerCase();
      if (!ext || !["jpg", "jpeg", "png", "webp", "gif", "heic", "svg"].includes(ext)) continue;

      // Strip extension and try to match
      const baseName = filename.replace(/\.[^.]+$/, "");
      const normalized = norm(baseName);

      // Try exact SKU match first, then name match, then partial match
      let productId = bySku.get(normalized) || byName.get(normalized);

      if (!productId) {
        // Partial match: file name contains SKU or name contains file name
        for (const [sku, pid] of bySku) {
          if (normalized.includes(sku) || sku.includes(normalized)) { productId = pid; break; }
        }
      }
      if (!productId) {
        for (const [name, pid] of byName) {
          if (normalized.includes(name) || name.includes(normalized)) { productId = pid; break; }
        }
      }

      if (!productId) {
        unmatched.push(filename);
        continue;
      }

      // Upload to Supabase storage
      const imgBuffer = await entry.async("nodebuffer");
      const storagePath = `products/${productId}/${Date.now()}_${filename}`;
      const contentType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;

      const { error: upErr } = await admin.storage.from("attachments").upload(storagePath, imgBuffer, {
        contentType,
        upsert: false,
      });
      if (upErr) {
        unmatched.push(`${filename} (upload err: ${upErr.message})`);
        continue;
      }

      const { data: urlData } = admin.storage.from("attachments").getPublicUrl(storagePath);
      await admin.from("products").update({ image_url: urlData.publicUrl }).eq("id", productId);

      const product = products.find((p) => p.id === productId);
      matched.push({ filename, productId, productName: product?.name ?? "" });
      uploaded++;
    }

    return NextResponse.json({ uploaded, matched, unmatched, total: entries.length });
  } catch (err) {
    console.error("[bulk-upload-photos] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
