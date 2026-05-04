import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateContractHtml } from "@/lib/contract-template";
import { amountToWords } from "@/lib/numToWords";
import { toGenitiveFullName } from "@/lib/russianDeclension";

function fmt(n: number) { return Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ").replace(".", ","); }

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function formatDateRu(d: Date) { return `«${d.getDate()}» ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`; }

const LEGAL_FORM_SHORT: Record<string, string> = {
  "Общество с ограниченной ответственностью": "ООО",
  "Акционерное общество": "АО",
  "Публичное акционерное общество": "ПАО",
  "Закрытое акционерное общество": "ЗАО",
  "Открытое акционерное общество": "ОАО",
  "Индивидуальный предприниматель": "ИП",
};
function shortLegalForm(full?: string | null): string {
  if (!full) return "";
  return LEGAL_FORM_SHORT[full] ?? full;
}

// Build the buyer label for contract/spec headers and footers — e.g. "ООО «СПИНА»"
// or "ИП Иванов И.И.". Backlog v5 §2.2.5: footer was missing the ООО prefix.
function formatBuyerName(legalForm: string | null | undefined, name: string | null | undefined): string {
  const safe = (name ?? "").trim();
  if (!safe) return "";
  const sf = shortLegalForm(legalForm);
  if (!sf) return safe;
  if (sf === "ИП") return `ИП ${safe}`;
  return `${sf} «${safe}»`;
}

// Sort spec items so service rows (delivery) are always last in the table.
// Backlog v5 §2.2.4: delivery showed up first, должно быть последней.
type SpecItem = { name: string; quantity: number; price: number; total: number; sort_order?: number };
function sortSpecItems<T extends SpecItem>(items: T[]): T[] {
  const isDelivery = (n: string) => /^(доставк|транспорт|курьер|сдэк)/i.test(n.trim());
  const goods = items.filter((i) => !isDelivery(i.name));
  const services = items.filter((i) => isDelivery(i.name));
  return [...goods, ...services];
}

// Genitive case for the small numerals we need in templates ("в течение N
// рабочих дней"). 1–10 covers every realistic shipment_days value.
const SMALL_NUMERAL_GENITIVE: Record<number, string> = {
  1: "одного", 2: "двух", 3: "трёх", 4: "четырёх", 5: "пяти",
  6: "шести", 7: "семи", 8: "восьми", 9: "девяти", 10: "десяти",
};
function shipDaysWords(n: number): string {
  return SMALL_NUMERAL_GENITIVE[n] ?? String(n);
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
    const { data: rawItems } = await admin.from("specification_items").select("*").eq("specification_id", specId).order("sort_order");
    const items = sortSpecItems(rawItems ?? []);
    const total = items.reduce((s, i) => s + (i.total || 0), 0);
    const sumWords = amountToWords(total);

    const buyerHeader = formatBuyerName(contract.buyer_legal_form, contract.buyer_name);
    const directorTitle = contract.buyer_director_title || "генерального директора";
    const directorGenitive = toGenitiveFullName(contract.buyer_director_name || "");
    const directorBasis = contract.buyer_director_basis || "Устава";
    const shipDays = spec.shipment_days || 3;
    const paymentTerms = spec.payment_terms ||
      "Покупатель вносит предоплату на расчётный счёт Поставщика в размере 100% от общей стоимости партии товаров, указанных в спецификации к настоящему Договору.";
    const deliveryMethod = spec.delivery_method || "СДЭК";
    const extraDeliveryTerms = spec.delivery_terms ||
      "Обязанность Поставщика по передаче Товара считается исполненной с момента передачи Товара в курьерскую службу. В случае осуществления доставки Товара по городу Казани доставка производится за счёт Поставщика. При этом обязанность Поставщика по передаче Товара считается исполненной с момента передачи Товара Заказчику либо его уполномоченному представителю.";

    return NextResponse.json({
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Спецификация №${spec.spec_number}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:20mm 15mm;color:#000;line-height:1.5}table{border-collapse:collapse;width:100%}.items td,.items th{border:1px solid #000;padding:4px 8px;font-size:11px}.items th{text-align:center;font-weight:bold}.items .r{text-align:right}.items .c{text-align:center}.sign-block{margin-top:18px;position:relative;min-height:120px}.stamp{position:absolute;left:0;top:36px;width:150px;opacity:0.85}.signature{position:absolute;left:170px;top:0;width:120px;opacity:0.9}@media print{body{margin:10mm 15mm}@page{size:A4}}</style></head><body>
<h2 style="text-align:center;margin-bottom:5px">СПЕЦИФИКАЦИЯ №${spec.spec_number}</h2>
<p style="text-align:center;margin-top:0">к договору поставки №${contract.contract_number} от ${new Date(contract.contract_date).toLocaleDateString("ru-RU")}</p>
<table style="width:100%;margin:10px 0"><tr><td>город Казань</td><td style="text-align:right">${formatDateRu(new Date(spec.spec_date))}</td></tr></table>
<p>${supplier?.legal_name || "Индивидуальный предприниматель Абзалов Никита Львович"}, именуемый в дальнейшем «Поставщик», действующий на основании ОГРНИП ${supplier?.ogrnip || "323183200014134"}, и ${buyerHeader}, именуемое в дальнейшем «Покупатель», в лице ${directorTitle} ${directorGenitive}, действующего на основании ${directorBasis}, с другой стороны, далее совместно именуемые «Стороны», являющиеся Сторонами Договора поставки №${contract.contract_number} от ${new Date(contract.contract_date).toLocaleDateString("ru-RU")}г., заключили настоящую спецификацию о нижеследующем:</p>
<table class="items" style="margin:15px 0"><thead><tr><th style="width:30px">№</th><th>Наименование</th><th style="width:50px">Кол-во</th><th style="width:80px" class="r">Цена</th><th style="width:90px" class="r">Сумма</th></tr></thead><tbody>
${items.map((item, i) => `<tr><td class="c">${i + 1}</td><td>${item.name}</td><td class="c">${item.quantity}</td><td class="r">${fmt(item.price)}</td><td class="r">${fmt(item.total)}</td></tr>`).join("")}
</tbody></table>
<p><strong>Итого: ${fmt(total)} рублей, без НДС</strong></p>
<p>Общая стоимость товаров по данной Спецификации составляет ${fmt(total)} руб. (${sumWords}) без НДС.</p>
<p>Помимо указанных в Табличном виде условий, Стороны пришли к соглашению о согласовании следующих условий поставки:</p>
<ol>
<li>Подписывая настоящую Спецификацию, Покупатель подтверждает, что до заключения настоящего Договора ознакомлен с качеством и внешним видом Товара, подлежащего поставке. Качественные характеристики Товара соответствуют условиям Договора.</li>
<li>После исполнения Покупателем обязанности по оплате стоимости Товара, Поставщик повторно направляет Покупателю макет изделия (фотоизображения) для окончательного согласования.</li>
<li>Доставка Товара осуществляется путем передачи упакованного Товара в курьерскую службу ${deliveryMethod}. ${extraDeliveryTerms}</li>
<li>Срок отгрузки: в течение ${shipDays} (${shipDaysWords(shipDays)}) рабочих дней с даты исполнения Покупателем обязанности по оплате.</li>
<li>Условия оплаты: ${paymentTerms}</li>
</ol>
<table style="width:100%;margin-top:30px"><tr>
<td style="width:50%;vertical-align:top"><strong>ПОСТАВЩИК</strong><br>${supplier?.legal_name || "ИП Абзалов Никита Львович"}<br><br><div class="sign-block">${sigSrc ? `<img class="signature" src="${sigSrc}" />` : ""}${stampSrc ? `<img class="stamp" src="${stampSrc}" />` : ""}<div style="padding-top:18px">___________________/ ${supplier?.director_short || "Абзалов Н.Л."}</div></div></td>
<td style="width:50%;vertical-align:top"><strong>ПОКУПАТЕЛЬ</strong><br>${buyerHeader}<br><br>___________________/ ${contract.buyer_short_name || ""}</td>
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
    buyer_director_name: toGenitiveFullName(contract.buyer_director_name || ""),
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
