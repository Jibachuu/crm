// Server-side image downscaling. Catches large product / КП photos before
// they hit Supabase Storage, where each fetch from a 6 MB PNG burns a
// chunk of the monthly egress quota. We aim for ≤ ~600 KB by resizing
// the longest edge to 1600 px and re-encoding as JPEG q=80 (or PNG q=80
// for transparency).
//
// sharp ships transitively with Next.js (used by next/image). Falls back
// to passing the original buffer through unchanged if sharp can't load
// (e.g. unsupported runtime), so uploads never break.

// Sanitise filenames before they become Supabase Storage object keys.
// Real-world failure 2026-05-04: "Платёжное_поручение_№_1119_от_04_05_2026.PDF"
// → Storage rejected with "Invalid key" because the № character (and
// some cyrillic encodings) breaks the bucket-key URL contract. We keep
// the human-readable name in the DB column for display; this only
// touches the storage path.
export function safeStorageName(name: string): string {
  if (!name) return `file_${Date.now()}`;
  const base = name
    .normalize("NFKD")
    // Translit common cyrillic letters so the result is still readable
    // when someone browses Storage directly. Anything not covered falls
    // through to underscore via the [^A-Za-z0-9.\-_] cleanup below.
    .replace(/[а-яёА-ЯЁ]/g, (ch) => CYRILLIC_TRANSLIT[ch] ?? "_")
    .replace(/[№#?*\[\]\\:@+;=`%&<>()'"!,~\s]+/g, "_")
    .replace(/[^A-Za-z0-9.\-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) return `file_${Date.now()}`;
  // Cap total length — Supabase tolerates up to 1024, but very long
  // names tend to break clients downstream. 180 chars is plenty for a
  // human-readable hint.
  return base.length > 180 ? base.slice(0, 180) : base;
}

const CYRILLIC_TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", Ё: "Yo", Ж: "Zh", З: "Z",
  И: "I", Й: "Y", К: "K", Л: "L", М: "M", Н: "N", О: "O", П: "P", Р: "R",
  С: "S", Т: "T", У: "U", Ф: "F", Х: "H", Ц: "C", Ч: "Ch", Ш: "Sh", Щ: "Sch",
  Ъ: "", Ы: "Y", Ь: "", Э: "E", Ю: "Yu", Я: "Ya",
};

const MAX_EDGE = 1600;
const JPEG_QUALITY = 80;
const TARGET_BYTES = 700_000;

export async function downscaleImage(
  buffer: Buffer,
  contentType: string,
  opts: { preserveFormat?: boolean } = {},
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

    // preserveFormat=true keeps PNG-as-PNG so the storage path's
    // extension and content-type stay valid (used by the in-place
    // optimiser that overwrites existing objects). Default behaviour
    // is to collapse photos to JPEG for ~5x size win.
    const hasAlpha = !!meta.hasAlpha;
    const outIsPng = opts.preserveFormat ? contentType === "image/png" : hasAlpha;
    let outBuffer: Buffer;
    let outType: string;
    if (outIsPng) {
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
      if (outIsPng) {
        outBuffer = await second.png({ quality: 70, compressionLevel: 9, palette: true }).toBuffer();
      } else {
        outBuffer = await second.jpeg({ quality: 70, mozjpeg: true }).toBuffer();
      }
    }

    // If somehow our "optimised" version ended up bigger than the
    // original (rare — usually means the source was already close to
    // optimal), keep the original.
    if (outBuffer.byteLength >= buffer.byteLength) {
      return { buffer, contentType, resized: false };
    }

    return { buffer: outBuffer, contentType: outType, resized: true };
  } catch {
    // Any sharp failure (corrupted image, etc.) — fall back to original.
    return { buffer, contentType, resized: false };
  }
}
