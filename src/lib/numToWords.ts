// Russian number to words for invoice amounts
const ones = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const onesF = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

function declension(n: number, one: string, two: string, five: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return five;
  if (b > 1 && b < 5) return two;
  if (b === 1) return one;
  return five;
}

function triplet(n: number, feminine: boolean): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const t = Math.floor(rest / 10);
  const o = rest % 10;
  const parts: string[] = [];
  if (h) parts.push(hundreds[h]);
  if (rest >= 10 && rest < 20) {
    parts.push(teens[rest - 10]);
  } else {
    if (t >= 2) parts.push(tens[t]);
    if (o) parts.push(feminine ? onesF[o] : ones[o]);
  }
  return parts.join(" ");
}

export function amountToWords(amount: number): string {
  const rub = Math.floor(Math.abs(amount));
  const kop = Math.round((Math.abs(amount) - rub) * 100);

  if (rub === 0) return `Ноль рублей ${String(kop).padStart(2, "0")} ${declension(kop, "копейка", "копейки", "копеек")}`;

  const parts: string[] = [];
  const billions = Math.floor(rub / 1_000_000_000);
  const millions = Math.floor((rub % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((rub % 1_000_000) / 1_000);
  const rest = rub % 1_000;

  if (billions) parts.push(triplet(billions, false) + " " + declension(billions, "миллиард", "миллиарда", "миллиардов"));
  if (millions) parts.push(triplet(millions, false) + " " + declension(millions, "миллион", "миллиона", "миллионов"));
  if (thousands) parts.push(triplet(thousands, true) + " " + declension(thousands, "тысяча", "тысячи", "тысяч"));
  if (rest) parts.push(triplet(rest, false));

  const rubWord = declension(rub, "рубль", "рубля", "рублей");
  const result = parts.join(" ").replace(/\s+/g, " ").trim();
  const capitalized = result.charAt(0).toUpperCase() + result.slice(1);

  return `${capitalized} ${rubWord} ${String(kop).padStart(2, "0")} ${declension(kop, "копейка", "копейки", "копеек")}`;
}
