// Server-side image downscaling. Catches large product / КП photos before
// they hit Supabase Storage, where each fetch from a 6 MB PNG burns a
// chunk of the monthly egress quota. We aim for ≤ ~600 KB by resizing
// the longest edge to 1600 px and re-encoding as JPEG q=80 (or PNG q=80
// for transparency).
//
// sharp ships transitively with Next.js (used by next/image). Falls back
// to passing the original buffer through unchanged if sharp can't load
// (e.g. unsupported runtime), so uploads never break.

const MAX_EDGE = 1600;
const JPEG_QUALITY = 80;
const TARGET_BYTES = 700_000;

export async function downscaleImage(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string; resized: boolean }> {
  // Skip non-images (audio, PDFs, etc.) and small images that don't need
  // resizing. < 200 KB images stay untouched — recompressing tiny PNGs
  // can sometimes inflate them.
  if (!contentType.startsWith("image/")) return { buffer, contentType, resized: false };
  if (buffer.byteLength < 200_000) return { buffer, contentType, resized: false };
  if (contentType === "image/svg+xml" || contentType === "image/gif") return { buffer, contentType, resized: false };

  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return { buffer, contentType, resized: false };
  }

  try {
    const img = sharp(buffer, { failOn: "none" }).rotate();
    const meta = await img.metadata();
    const longest = Math.max(meta.width ?? 0, meta.height ?? 0);

    let pipeline = img;
    if (longest > MAX_EDGE) {
      pipeline = pipeline.resize({ width: meta.width && meta.width >= meta.height ? MAX_EDGE : undefined, height: meta.height && meta.height > meta.width ? MAX_EDGE : undefined, withoutEnlargement: true });
    }

    // PNG → keep PNG when source has alpha (transparency), otherwise
    // collapse to JPEG which is ~5x smaller for photos.
    const hasAlpha = !!meta.hasAlpha;
    let outBuffer: Buffer;
    let outType: string;
    if (hasAlpha) {
      outBuffer = await pipeline.png({ quality: JPEG_QUALITY, compressionLevel: 9, palette: true }).toBuffer();
      outType = "image/png";
    } else {
      outBuffer = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
      outType = "image/jpeg";
    }

    // Belt-and-braces: if even after the first pass we're > target size,
    // try a second pass at a tighter quality. Common for 6000×6000 PNGs.
    if (outBuffer.byteLength > TARGET_BYTES) {
      const second = sharp(outBuffer, { failOn: "none" });
      if (hasAlpha) {
        outBuffer = await second.png({ quality: 70, compressionLevel: 9, palette: true }).toBuffer();
      } else {
        outBuffer = await second.jpeg({ quality: 70, mozjpeg: true }).toBuffer();
      }
    }

    return { buffer: outBuffer, contentType: outType, resized: true };
  } catch {
    // Any sharp failure (corrupted image, etc.) — fall back to original.
    return { buffer, contentType, resized: false };
  }
}
