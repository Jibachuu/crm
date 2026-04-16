import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateContractHtml } from "@/lib/contract-template";

function fmt(n: number) { return Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ").replace(".", ","); }

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function formatDateRu(d: Date) { return `«${d.getDate()}» ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`; }

function numberToWords(n: number): string {
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
  const type = searchParams.get("type") || "contract";
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

  // ── Specification ──
  if (type === "spec" && specId) {
    const { data: spec } = await admin.from("specifications").select("*").eq("id", specId).single();
    if (!spec) return NextResponse.json({ error: "Specification not found" }, { status: 404 });
    const { data: items } = await admin.from("specification_items").select("*").eq("specification_id", specId).order("sort_order");
    const total = (items ?? []).reduce((s, i) => s + (i.total || 0), 0);
    const totalWords = numberToWords(Math.floor(total));
    const kopecks = Math.round((total % 1) * 100);

    return NextResponse.json({
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Спецификация №${spec.spec_number}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:20mm 15mm;color:#000;line-height:1.5}table{border-collapse:collapse;width:100%}.items td,.items th{border:1px solid #000;padding:4px 8px;font-size:11px}.items th{text-align:center;font-weight:bold}.items .r{text-align:right}.items .c{text-align:center}.sign-block{margin-top:30px;position:relative}.stamp{position:absolute;left:0;bottom:-10px;width:140px;opacity:0.8}.signature{position:absolute;left:160px;bottom:10px;width:100px;opacity:0.8}@media print{body{margin:10mm 15mm}@page{size:A4}}</style></head><body>
<h2 style="text-align:center;margin-bottom:5px">СПЕЦИФИКАЦИЯ №${spec.spec_number}</h2>
<p style="text-align:center;margin-top:0">к договору поставки №${contract.contract_number} от ${new Date(contract.contract_date).toLocaleDateString("ru-RU")}</p>
<table style="width:100%;margin:10px 0"><tr><td>город Казань</td><td style="text-align:right">${formatDateRu(new Date(spec.spec_date))}</td></tr></table>
<p>${supplier?.legal_name || "Индивидуальный предприниматель Абзалов Никита Львович"}, именуемый в дальнейшем «Поставщик», действующий на основании ОГРНИП ${supplier?.ogrnip || "323183200014134"}, и ${contract.buyer_legal_form || "Общество с ограниченной ответственностью"} "${contract.buyer_name}", именуемое в дальнейшем «Покупатель», в лице ${contract.buyer_director_title || "генерального директора"} ${contract.buyer_director_name || ""}, действующего на основании ${contract.buyer_director_basis || "Устава"}, с другой стороны, далее совместно именуемые «Стороны», являющиеся Сторонами Договора поставки №${contract.contract_number} от ${new Date(contract.contract_date).toLocaleDateString("ru-RU")}г., заключили настоящую спецификацию о нижеследующем:</p>
<table class="items" style="margin:15px 0"><thead><tr><th style="width:30px">№</th><th>Наименование</th><th style="width:50px">Кол-во</th><th style="width:80px" class="r">Цена</th><th style="width:90px" class="r">Сумма</th></tr></thead><tbody>
${(items ?? []).map((item, i) => `<tr><td class="c">${i + 1}</td><td>${item.name}</td><td class="c">${item.quantity}</td><td class="r">${fmt(item.price)}</td><td class="r">${fmt(item.total)}</td></tr>`).join("")}
</tbody></table>
<p><strong>Итого: ${fmt(total)} рублей, без НДС</strong></p>
<p>Общая стоимость товаров по данной Спецификации составляет ${fmt(total)} руб. (${totalWords}) ${kopecks > 0 ? `рублей ${String(kopecks).padStart(2, "0")} копеек` : "рублей 00 копеек"} без НДС.</p>
<p>Помимо указанных в Табличном виде условий, Стороны пришли к соглашению о согласовании следующих условий поставки:</p>
<ol>
<li>Подписывая настоящую Спецификацию, Покупатель подтверждает, что до заключения настоящего Договора ознакомлен с качеством и внешним видом Товара, подлежащего поставке.</li>
<li>После исполнения Покупателем обязанности по оплате стоимости Товара, Поставщик повторно направляет Покупателю макет изделия (фотоизображения) для окончательного согласования.</li>
<li>Доставка Товара осуществляется путем передачи упакованного Товара в курьерскую службу ${spec.delivery_method || "СДЭК"}. ${spec.delivery_terms || ""}</li>
<li>Срок отгрузки: в течение ${spec.shipment_days || 12} (${numberToWords(spec.shipment_days || 12)}) рабочих дней с даты исполнения Покупателем обязанности по оплате.</li>
<li>Условия оплаты: ${spec.payment_terms || "Покупатель вносит предоплату на расчетный счет Поставщика в размере 100% от общей стоимости партии товаров."}</li>
</ol>
<table style="width:100%;margin-top:30px"><tr>
<td style="width:50%;vertical-align:top"><strong>ПОСТАВЩИК</strong><br>${supplier?.legal_name || "ИП Абзалов Никита Львович"}<br><br><div class="sign-block">${stampSrc ? `<img class="stamp" src="${stampSrc}" />` : ""}${sigSrc ? `<img class="signature" src="${sigSrc}" />` : ""}___________________/ ${supplier?.director_short || "Абзалов Н.Л."}</div></td>
<td style="width:50%;vertical-align:top"><strong>ПОКУПАТЕЛЬ</strong><br>${contract.buyer_name}<br><br>___________________/ ${contract.buyer_short_name || ""}</td>
</tr></table>
<script>document.title='Спецификация ${spec.spec_number} к договору ${contract.contract_number}';</script>
<div style="text-align:center;margin:15px 0" id="printBtn"><button onclick="this.parentElement.style.display='none';window.print()" style="padding:10px 30px;font-size:14px;background:#0067a5;color:#fff;border:none;border-radius:6px;cursor:pointer">Печать / Сохранить PDF</button></div>
</body></html>`,
    });
  }

  // ── Full contract ──
  const html = generateContractHtml({
    contract_number: contract.contract_number, date: dateStr,
    supplier_name: supplier?.legal_name || "Индивидуальный предприниматель Абзалов Никита Львович",
    supplier_ogrnip: supplier?.ogrnip || "323183200014134",
    buyer_legal_form_full: contract.buyer_legal_form || "Общество с ограниченной ответственностью",
    buyer_name: contract.buyer_name,
    buyer_director_title: contract.buyer_director_title || "генерального директора",
    buyer_director_name: contract.buyer_director_name || "",
    buyer_director_basis: contract.buyer_director_basis || "Устава",
    valid_until: validUntil,
    supplier_address: supplier?.address || "420054, Казань, ул. Воскресенская, 20а",
    supplier_inn: supplier?.inn || "", supplier_bank: supplier?.bank_name || "",
    supplier_account: supplier?.account_number || "", supplier_bik: supplier?.bik || "",
    supplier_corr: supplier?.corr_account || "", supplier_email: supplier?.email || "info@art-evo.ru",
    supplier_phone: supplier?.phone || "+7 (843) 297 33 22",
    supplier_short: supplier?.director_short || "Абзалов Н.Л.",
    buyer_address: contract.buyer_address || "",
    buyer_inn_kpp: `${contract.buyer_inn || ""}${contract.buyer_kpp ? "/" + contract.buyer_kpp : ""}`,
    buyer_ogrn: contract.buyer_ogrn || "", buyer_bank: contract.buyer_bank_name || "",
    buyer_account: contract.buyer_account || "", buyer_bik: contract.buyer_bik || "",
    buyer_corr: contract.buyer_corr_account || "", buyer_email: contract.buyer_email || "",
    buyer_phone: contract.buyer_phone || "", buyer_short: contract.buyer_short_name || "",
    stamp_img: stampSrc, sig_img: sigSrc,
  });

  return NextResponse.json({ html });
}
