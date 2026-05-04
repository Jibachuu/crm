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
    .replace(/[а-яёА-ЯЁ]/g, (ch) => CYRILLIC_TRANSLIT[ch] ?? "_")
    .replace(/[№#?*\[\]\\:@+;=`%&<>()'"!,~\s]+/g, "_")
    .replace(/[^A-Za-z0-9.\-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) return `file_${Date.now()}`;
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
