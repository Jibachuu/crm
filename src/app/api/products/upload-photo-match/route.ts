import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

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
    const filename = (formData.get("filename") as string) || file?.name || "";
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

    const admin = createAdminClient();

    // Load active products
    const { data: products } = await admin.from("products").select("id, name, sku").eq("is_active", true);
    if (!products) return NextResponse.json({ error: "Failed to load products" }, { status: 500 });

    const baseName = filename.replace(/\.[^.]+$/, "");
    const normalized = norm(baseName);

    // Match: exact SKU → exact name → partial
    let productId: string | null = null;
    let productName = "";

    for (const p of products) {
      if (p.sku && norm(p.sku) === normalized) { productId = p.id; productName = p.name; break; }
    }
    if (!productId) {
      for (const p of products) {
        if (p.name && norm(p.name) === normalized) { productId = p.id; productName = p.name; break; }
      }
    }
    if (!productId) {
      for (const p of products) {
        const ns = p.sku ? norm(p.sku) : "";
        const nn = p.name ? norm(p.name) : "";
        if ((ns && (normalized.includes(ns) || ns.includes(normalized))) ||
            (nn && (normalized.includes(nn) || nn.includes(normalized)))) {
          productId = p.id; productName = p.name; break;
        }
      }
    }

    if (!productId) {
      return NextResponse.json({ matched: false, filename });
    }

    // Upload to storage
    const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
    const storagePath = `products/${productId}/${Date.now()}_${filename}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || (ext === "jpg" ? "image/jpeg" : `image/${ext}`);

    const { error: upErr } = await admin.storage.from("attachments").upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: urlData } = admin.storage.from("attachments").getPublicUrl(storagePath);
    await admin.from("products").update({ image_url: urlData.publicUrl }).eq("id", productId);

    return NextResponse.json({ matched: true, productId, productName, filename, url: urlData.publicUrl });
  } catch (err) {
    console.error("[upload-photo-match] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}
