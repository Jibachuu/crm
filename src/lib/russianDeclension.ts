// Genitive case for Russian full names (ФИО). Used in contract templates
// where the director appears in "в лице ... ФИО" — a phrase that requires
// the genitive (родительный) case. We don't ship the full petrovich library
// (would be ~80kb of name dictionaries); the helper below covers the common
// surname/first-name/patronymic endings we actually see in the CRM and falls
// back to the original word when the rule doesn't apply.

const VOWELS = new Set("аеёиоуыэюя");

function endsWith(word: string, ...suffixes: string[]): string | null {
  for (const s of suffixes) {
    if (word.length > s.length && word.endsWith(s)) return s;
  }
  return null;
}

function isFemininePatronymic(p: string): boolean {
  return /(вна|шна|чна|щна|жна|зна|сна|тна)$/i.test(p);
}

function isMasculinePatronymic(p: string): boolean {
  return /(вич|ьич|ыч|ич)$/i.test(p);
}

function genitiveSurname(surname: string, feminine: boolean): string {
  const lower = surname.toLowerCase();

  // Indeclinable foreign / unusual endings.
  if (/[еэоиыуюъ]$/i.test(lower)) return surname;
  if (/[а-яё]ко$/i.test(lower)) return surname; // Шевченко

  if (feminine) {
    // -ова / -ева / -ёва / -ина / -ына → -овой / -евой / ... / -иной / -ыной
    if (/(ова|ева|ёва|ина|ына)$/i.test(lower)) return surname.slice(0, -1) + "ой";
    // -ская / -цкая → -ской / -цкой
    if (/(ская|цкая)$/i.test(lower)) return surname.slice(0, -2) + "ой";
    // -ая → -ой (generic adj)
    if (lower.endsWith("ая")) return surname.slice(0, -2) + "ой";
    // -я → -и (Беря → Бери)
    if (lower.endsWith("я")) return surname.slice(0, -1) + "и";
    // -а → -ы
    if (lower.endsWith("а")) return surname.slice(0, -1) + "ы";
    // Foreign / consonant endings: do not decline for women.
    return surname;
  }

  // Masculine surnames.
  if (/(ов|ев|ёв|ин|ын)$/i.test(lower)) return surname + "а";
  if (/(ский|цкий)$/i.test(lower)) return surname.slice(0, -2) + "ого";
  if (/(ий|ый|ой)$/i.test(lower)) return surname.slice(0, -2) + "ого";
  if (lower.endsWith("ь")) return surname.slice(0, -1) + "я";
  if (lower.endsWith("й")) return surname.slice(0, -1) + "я";
  if (lower.endsWith("я")) return surname.slice(0, -1) + "и";
  if (lower.endsWith("а")) return surname.slice(0, -1) + "ы";
  // Most consonant-ending masculine surnames take +а: Стуконог → Стуконога,
  // Абзалов → Абзалова (covered above), Рабинович → Рабиновича.
  if (!VOWELS.has(lower[lower.length - 1])) return surname + "а";
  return surname;
}

function genitiveFirstName(name: string, feminine: boolean): string {
  const lower = name.toLowerCase();
  if (feminine) {
    if (lower.endsWith("я")) return name.slice(0, -1) + "и";
    if (lower.endsWith("а")) return name.slice(0, -1) + "ы";
    if (lower.endsWith("ь")) return name.slice(0, -1) + "и";
    return name;
  }
  // Masculine first names.
  if (lower.endsWith("й")) return name.slice(0, -1) + "я"; // Сергей → Сергея
  if (lower.endsWith("ь")) return name.slice(0, -1) + "я"; // Игорь → Игоря
  if (lower.endsWith("я")) return name.slice(0, -1) + "и"; // Илья → Ильи
  if (lower.endsWith("а")) return name.slice(0, -1) + "ы"; // Никита → Никиты
  if (!VOWELS.has(lower[lower.length - 1])) return name + "а"; // Михаил → Михаила
  return name;
}

function genitivePatronymic(p: string): string {
  const lower = p.toLowerCase();
  if (isFemininePatronymic(p)) {
    // -на → -ны
    if (lower.endsWith("на")) return p.slice(0, -1) + "ы";
    return p;
  }
  if (isMasculinePatronymic(p)) {
    // -вич/-ич/-ыч → +а
    return p + "а";
  }
  // Unknown ending — don't change.
  return p;
}

function detectFeminine(parts: string[]): boolean {
  // Look at the patronymic (third token) first — it's the most reliable
  // signal. If absent, peek at the surname's "-ова/-ева/-ская/-ая" endings.
  if (parts.length >= 3 && isFemininePatronymic(parts[2])) return true;
  if (parts.length >= 3 && isMasculinePatronymic(parts[2])) return false;
  const lastSurname = parts[0]?.toLowerCase() ?? "";
  if (/(ова|ева|ёва|ина|ына|ская|цкая|ая|яя)$/.test(lastSurname)) return true;
  return false;
}

// Convert a full Russian name "Surname First Patronymic" to genitive case.
// Accepts also "First Surname" or "Surname First" — we detect by patronymic
// presence. Returns the original input if it doesn't look like a Russian
// name at all (no Cyrillic, single token, etc.).
export function toGenitiveFullName(fullName: string): string {
  const trimmed = (fullName || "").trim();
  if (!trimmed) return trimmed;
  if (!/[А-ЯЁа-яё]/.test(trimmed)) return trimmed;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];

  const feminine = detectFeminine(parts);

  // Heuristic for token roles: if 3 tokens and the 3rd looks patronymic,
  // assume "Surname First Patronymic". Otherwise fall back to "First
  // Patronymic Surname" only when token 2 is patronymic.
  let surnameIdx = 0, firstIdx = 1, patroIdx = 2;
  if (parts.length >= 3 && (isMasculinePatronymic(parts[2]) || isFemininePatronymic(parts[2]))) {
    surnameIdx = 0; firstIdx = 1; patroIdx = 2;
  } else if (parts.length >= 3 && (isMasculinePatronymic(parts[1]) || isFemininePatronymic(parts[1]))) {
    firstIdx = 0; patroIdx = 1; surnameIdx = 2;
  }

  const out = [...parts];
  if (out[surnameIdx]) out[surnameIdx] = genitiveSurname(out[surnameIdx], feminine);
  if (out[firstIdx]) out[firstIdx] = genitiveFirstName(out[firstIdx], feminine);
  if (parts.length >= 3 && out[patroIdx]) out[patroIdx] = genitivePatronymic(out[patroIdx]);
  return out.join(" ");
}
