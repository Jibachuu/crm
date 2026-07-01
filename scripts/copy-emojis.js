// Копирует Apple-PNG эмодзи из node_modules/emoji-datasource-apple/img/apple/64/
// в public/apple-emoji/, чтобы отдавать их с нашего домена, а не с
// внешнего CDN (некоторые провайдеры режут jsdelivr/Cloudflare).
// Запускается в postinstall — попадает в билд автоматически.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "node_modules", "emoji-datasource-apple", "img", "apple", "64");
const DST = path.join(__dirname, "..", "public", "apple-emoji");

if (!fs.existsSync(SRC)) {
  console.log("[emojis] source not found, skipping:", SRC);
  process.exit(0);
}

fs.mkdirSync(DST, { recursive: true });

const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".png"));
let copied = 0;
let skipped = 0;
for (const f of files) {
  const s = path.join(SRC, f);
  const d = path.join(DST, f);
  try {
    // Пропускаем если размер и mtime те же — не тратим IO
    const ss = fs.statSync(s);
    let ds = null;
    try { ds = fs.statSync(d); } catch {}
    if (ds && ds.size === ss.size && ds.mtimeMs >= ss.mtimeMs) { skipped++; continue; }
    fs.copyFileSync(s, d);
    copied++;
  } catch (e) {
    console.error("[emojis] failed", f, e.message);
  }
}
console.log(`[emojis] copied=${copied} skipped=${skipped} total=${files.length}`);
