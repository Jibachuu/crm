import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function fmt(n: number) { return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function formatDateRu(d: Date) { return `«${d.getDate()}» ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function numberToWords(n: number): string {
  // Simplified Russian number to words
  const units = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

  if (n === 0) return "ноль";
  const int = Math.floor(n);
  const parts: string[] = [];

  const t = Math.floor(int / 1000);
  if (t > 0) {
    if (t === 1) parts.push("одна тысяча");
    else if (t === 2) parts.push("две тысячи");
    else if (t >= 3 && t <= 4) parts.push(units[t] + " тысячи");
    else if (t >= 5 && t <= 20) parts.push(units[t] || teens[t - 10] || (tens[Math.floor(t / 10)] + " " + units[t % 10]).trim() + " тысяч");
    else parts.push(String(t) + " тысяч");
  }

  const rem = int % 1000;
  if (rem > 0) {
    const h = Math.floor(rem / 100);
    if (h > 0) parts.push(hundreds[h]);
    const d = rem % 100;
    if (d >= 10 && d <= 19) parts.push(teens[d - 10]);
    else {
      const t2 = Math.floor(d / 10);
      const u = d % 10;
      if (t2 > 0) parts.push(tens[t2]);
      if (u > 0) parts.push(units[u]);
    }
  }

  return parts.join(" ");
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contractId = searchParams.get("id");
  const type = searchParams.get("type") || "contract"; // "contract" or "spec"
  const specId = searchParams.get("spec_id");

  if (!contractId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: contract } = await admin.from("contracts").select("*").eq("id", contractId).single();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const { data: supplier } = await admin.from("supplier_settings").select("*").limit(1).single();

  const d = new Date(contract.contract_date);
  const dateStr = formatDateRu(d);
  const validUntil = contract.valid_until ? new Date(contract.valid_until).toLocaleDateString("ru-RU") : "31.12." + d.getFullYear();

  function proxyUrl(url: string) { return `/api/image-proxy?url=${encodeURIComponent(url)}`; }
  const stampSrc = supplier?.stamp_url ? proxyUrl(supplier.stamp_url) : "";
  const sigSrc = supplier?.signature_url ? proxyUrl(supplier.signature_url) : "";

  if (type === "spec" && specId) {
    // Generate specification
    const { data: spec } = await admin.from("specifications").select("*").eq("id", specId).single();
    if (!spec) return NextResponse.json({ error: "Specification not found" }, { status: 404 });

    const { data: items } = await admin.from("specification_items").select("*").eq("specification_id", specId).order("sort_order");
    const total = (items ?? []).reduce((s, i) => s + (i.total || 0), 0);
    const totalWords = numberToWords(Math.floor(total));
    const kopecks = Math.round((total % 1) * 100);

    return NextResponse.json({
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Спецификация №${spec.spec_number}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:20mm 15mm;color:#000;line-height:1.5}
table{border-collapse:collapse;width:100%}
.items td,.items th{border:1px solid #000;padding:4px 8px;font-size:11px}
.items th{text-align:center;font-weight:bold}
.items .r{text-align:right}
.items .c{text-align:center}
.sign-block{margin-top:30px;position:relative}
.stamp{position:absolute;left:0;bottom:-10px;width:140px;opacity:0.8}
.signature{position:absolute;left:160px;bottom:10px;width:100px;opacity:0.8}
@media print{body{margin:10mm 15mm}@page{size:A4}}
</style></head><body>
<h2 style="text-align:center;margin-bottom:5px">СПЕЦИФИКАЦИЯ №${spec.spec_number}</h2>
<p style="text-align:center;margin-top:0">к договору поставки №${contract.contract_number} от ${new Date(contract.contract_date).toLocaleDateString("ru-RU")}</p>
<table style="width:100%;margin:10px 0"><tr><td>город Казань</td><td style="text-align:right">${formatDateRu(new Date(spec.spec_date))}</td></tr></table>

<p>${supplier?.legal_name || "Индивидуальный предприниматель Абзалов Никита Львович"}, именуемый в дальнейшем «Поставщик», действующий на основании ОГРНИП ${supplier?.ogrnip || "323183200014134"}, и ${contract.buyer_legal_form || "Общество с ограниченной ответственностью"} "${contract.buyer_name}", именуемое в дальнейшем «Покупатель», в лице ${contract.buyer_director_title || "генерального директора"} ${contract.buyer_director_name || ""}, действующего на основании ${contract.buyer_director_basis || "Устава"}, с другой стороны, далее совместно именуемые «Стороны», являющиеся Сторонами Договора поставки №${contract.contract_number} от ${new Date(contract.contract_date).toLocaleDateString("ru-RU")}г., заключили настоящую спецификацию о нижеследующем:</p>

<table class="items" style="margin:15px 0">
<thead><tr><th style="width:30px">№</th><th>Наименование</th><th style="width:50px">Кол-во</th><th style="width:80px" class="r">Цена</th><th style="width:90px" class="r">Сумма</th></tr></thead>
<tbody>
${(items ?? []).map((item, i) => `<tr><td class="c">${i + 1}</td><td>${item.name}</td><td class="c">${item.quantity}</td><td class="r">${fmt(item.price)}</td><td class="r">${fmt(item.total)}</td></tr>`).join("")}
</tbody>
</table>

<p><strong>Итого: ${fmt(total)} рублей, без НДС</strong></p>
<p>Общая стоимость товаров по данной Спецификации составляет ${fmt(total)} руб. (${totalWords}) ${kopecks > 0 ? `рублей ${String(kopecks).padStart(2, "0")} копеек` : "рублей 00 копеек"} без НДС.</p>

<p>Помимо указанных в Табличном виде условий, Стороны пришли к соглашению о согласовании следующих условий поставки:</p>
<ol>
<li>Подписывая настоящую Спецификацию, Покупатель подтверждает, что до заключения настоящего Договора ознакомлен с качеством и внешним видом Товара, подлежащего поставке.</li>
<li>После исполнения Покупателем обязанности по оплате стоимости Товара, Поставщик повторно направляет Покупателю макет изделия (фотоизображения) для окончательного согласования.</li>
<li>Доставка Товара осуществляется путем передачи упакованного Товара в курьерскую службу ${spec.delivery_method || "СДЭК"}. ${spec.delivery_terms || ""}</li>
<li>Срок отгрузки: в течение ${spec.shipment_days || 3} (${numberToWords(spec.shipment_days || 3)}) рабочих дней с даты исполнения Покупателем обязанности по оплате.</li>
<li>Условия оплаты: ${spec.payment_terms || "Покупатель вносит предоплату на расчетный счет Поставщика в размере 100% от общей стоимости партии товаров."}</li>
</ol>

<table style="width:100%;margin-top:30px"><tr>
<td style="width:50%;vertical-align:top">
<strong>ПОСТАВЩИК</strong><br>
${supplier?.legal_name || "Индивидуальный предприниматель Абзалов Никита Львович"}<br><br>
<div class="sign-block">
${stampSrc ? `<img class="stamp" src="${stampSrc}" />` : ""}
${sigSrc ? `<img class="signature" src="${sigSrc}" />` : ""}
___________________/ ${supplier?.director_short || "Абзалов Н.Л."}
</div>
</td>
<td style="width:50%;vertical-align:top">
<strong>ПОКУПАТЕЛЬ</strong><br>
${contract.buyer_name}<br><br>
___________________/ ${contract.buyer_short_name || ""}
</td>
</tr></table>

<script>document.title='Спецификация ${spec.spec_number} к договору ${contract.contract_number}';</script>
<div style="text-align:center;margin:15px 0" id="printBtn">
<button onclick="this.parentElement.style.display='none';window.print()" style="padding:10px 30px;font-size:14px;background:#0067a5;color:#fff;border:none;border-radius:6px;cursor:pointer">Печать / Сохранить PDF</button>
</div>
</body></html>`,
    });
  }

  // Generate contract
  return NextResponse.json({
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Договор поставки №${contract.contract_number}</title>
<style>body{font-family:Arial,sans-serif;font-size:11px;margin:15mm;color:#000;line-height:1.5}
h2{text-align:center;font-size:14px}
.sign-block{position:relative}
.stamp{position:absolute;left:0;bottom:-10px;width:140px;opacity:0.8}
.signature{position:absolute;left:160px;bottom:10px;width:100px;opacity:0.8}
@media print{body{margin:10mm 12mm}@page{size:A4;margin:10mm 12mm}}
p{margin:3px 0;text-align:justify}
</style></head><body>
<h2>ДОГОВОР ПОСТАВКИ №${contract.contract_number}</h2>
<table style="width:100%"><tr><td>город Казань</td><td style="text-align:right">${dateStr}</td></tr></table>

<p>${supplier?.legal_name || "Индивидуальный предприниматель Абзалов Никита Львович"}, именуемый в дальнейшем «Поставщик», действующий на основании ОГРНИП ${supplier?.ogrnip || "323183200014134"}, и ${contract.buyer_legal_form || "Общество с ограниченной ответственностью"} "${contract.buyer_name}", именуемое в дальнейшем «Покупатель», в лице ${contract.buyer_director_title || "генерального директора"} ${contract.buyer_director_name || ""}, действующего на основании ${contract.buyer_director_basis || "Устава"}, с другой стороны, далее совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:</p>

<h3>1. ПРЕДМЕТ ДОГОВОРА</h3>
<p>1.1. По настоящему договору Поставщик обязуется на согласованных Сторонами условиях передать в собственность Покупателя Товары, а Покупатель обязуется принимать и оплачивать Товары на условиях, установленных настоящим Договором.</p>
<p>1.2. Товары приобретаются Покупателем для использования в предпринимательской деятельности.</p>
<p>1.3. Поставщик гарантирует, что является собственником Товаров, Товар в споре или под арестом не состоит.</p>
<p>1.4. Поставщик гарантирует, что поставляемый Товар полностью соответствует стандартам производителя.</p>

<h3>2. СУЩЕСТВЕННЫЕ УСЛОВИЯ И ПОРЯДОК ИХ СОГЛАСОВАНИЯ</h3>
<p>2.1. Условие о Товаре, его количестве и цене признаются Сторонами существенными и подлежат согласованию путем подписания спецификации.</p>
<p>2.2. Покупатель направляет Поставщику заявку. Поставщик в течение 3 рабочих дней направляет спецификацию.</p>
<p>2.3. Существенные условия считаются согласованными при подписании спецификации или перечислении средств.</p>

<h3>3. ЦЕНА ТОВАРА И ПОРЯДОК РАСЧЕТОВ</h3>
<p>3.1. Цена Товара подлежит согласованию в порядке раздела 2.</p>
<p>3.4. В связи с применением Поставщиком УСН НДС не предъявляется (ст. 346.11 НК РФ).</p>
<p>3.6. Покупатель вносит предоплату 100% на расчетный счет Поставщика.</p>
<p>3.7. Срок оплаты — 7 рабочих дней с даты подписания спецификации.</p>

<h3>4. ПОРЯДОК ПОСТАВКИ</h3>
<p>4.1. Поставщик осуществляет поставку по согласованному адресу и условиям.</p>
<p>4.4. Право собственности переходит к Покупателю с момента передачи перевозчику.</p>
<p>4.7. Покупатель проверяет Товар не позднее 3 рабочих дней с момента поставки.</p>
<p>4.16. Гарантия на Товар — на условиях изготовителя. При отсутствии — 1 год.</p>

<h3>5. ПРАВА И ОБЯЗАННОСТИ СТОРОН</h3>
<p>5.1. Поставщик обязан поставить Товар надлежащего качества в согласованный срок.</p>
<p>5.2. Покупатель обязан оплатить и принять Товар.</p>

<h3>6. ОТВЕТСТВЕННОСТЬ СТОРОН</h3>
<p>6.2. Неустойка за просрочку оплаты — 0,1% за каждый день.</p>
<p>6.3. Неустойка за просрочку поставки — 0,1% за каждый день.</p>

<h3>7. КОНФИДЕНЦИАЛЬНОСТЬ</h3>
<p>7.1. Стороны сохраняют конфиденциальность информации по настоящему Договору.</p>

<h3>8. РАЗРЕШЕНИЕ СПОРОВ</h3>
<p>8.1. Обязательный досудебный (претензионный) порядок. Срок рассмотрения претензии — 10 рабочих дней.</p>
<p>8.3. Споры — в Арбитражном суде по месту нахождения истца.</p>

<h3>9. ЗАВЕРЕНИЯ ОБ ОБСТОЯТЕЛЬСТВАХ</h3>
<p>9.1. Стороны подтверждают наличие полномочий на совершение сделки.</p>

<h3>10. СРОК ДЕЙСТВИЯ</h3>
<p>10.1. Договор действует до ${validUntil}.</p>
<p>10.3. Одностороннее расторжение — за 15 календарных дней до даты расторжения.</p>
<p>10.4. Автопролонгация на следующий календарный год.</p>

<h3>11. ОБСТОЯТЕЛЬСТВА НЕПРЕОДОЛИМОЙ СИЛЫ</h3>
<p>11.1. Стороны не несут ответственности за форс-мажор.</p>

<h3>12. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ</h3>
<p>12.1. Изменения — в письменной форме за подписями Сторон.</p>
<p>Договор подписан в двух экземплярах на русском языке.</p>

<h3>13. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН</h3>
<table style="width:100%;margin-top:10px"><tr>
<td style="width:50%;vertical-align:top;padding-right:20px">
<strong>ПОСТАВЩИК</strong><br>
${supplier?.legal_name || "ИП Абзалов Никита Львович"}<br>
Адрес: ${supplier?.address || "420054, Казань, ул. Воскресенская, 20а"}<br>
ИНН ${supplier?.inn || ""}<br>
ОГРНИП ${supplier?.ogrnip || ""}<br>
Банк: ${supplier?.bank_name || ""}<br>
Р/с: ${supplier?.account_number || ""}<br>
БИК: ${supplier?.bik || ""}<br>
К/с: ${supplier?.corr_account || ""}<br>
E-mail: ${supplier?.email || "info@art-evo.ru"}<br>
Тел: ${supplier?.phone || ""}<br><br>
<div class="sign-block">
${stampSrc ? `<img class="stamp" src="${stampSrc}" />` : ""}
${sigSrc ? `<img class="signature" src="${sigSrc}" />` : ""}
<p>___________________/ ${supplier?.director_short || "Абзалов Н.Л."}</p>
</div>
</td>
<td style="width:50%;vertical-align:top">
<strong>ПОКУПАТЕЛЬ</strong><br>
${contract.buyer_legal_form || ""} «${contract.buyer_name}»<br>
Адрес: ${contract.buyer_address || ""}<br>
ИНН/КПП: ${contract.buyer_inn || ""}${contract.buyer_kpp ? "/" + contract.buyer_kpp : ""}<br>
ОГРН: ${contract.buyer_ogrn || ""}<br>
Банк: ${contract.buyer_bank_name || ""}<br>
Р/с: ${contract.buyer_account || ""}<br>
БИК: ${contract.buyer_bik || ""}<br>
К/с: ${contract.buyer_corr_account || ""}<br>
E-mail: ${contract.buyer_email || ""}<br>
Тел: ${contract.buyer_phone || ""}<br><br>
<p>___________________/ ${contract.buyer_short_name || ""}</p>
</td>
</tr></table>

<script>document.title='Договор поставки №${contract.contract_number}';</script>
<div style="text-align:center;margin:15px 0" id="printBtn">
<button onclick="this.parentElement.style.display='none';window.print()" style="padding:10px 30px;font-size:14px;background:#0067a5;color:#fff;border:none;border-radius:6px;cursor:pointer">Печать / Сохранить PDF</button>
</div>
</body></html>`,
  });
}
