// Invoice-contract template (backlog v6 §4.5)
//
// Однотраничный гибрид «счёт + договор поставки». Жиба прислала образец
// «Счёт-договор №35 от 09.02.2026» — компактный одностраничный документ:
// банковские реквизиты в шапке, преамбула со сторонами, таблица товаров,
// 7 коротких пунктов с условиями (сумма, срок оплаты, срок действия,
// экземпляры, УПД).
//
// В отличие от обычного договора поставки (13 разделов, §1–§13), здесь
// нет «Заявка → Спецификация» процесса, нет ответственности 0.1%/день,
// нет конфиденциальности — всё уплотнено в один документ.

function fmtMoney(n: number): string {
  return Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ").replace(".", ",");
}

export type InvoiceContractVars = {
  contract_number: string;
  date_ru: string;            // «09» февраля 2026 г.

  // Supplier (поставщик) — из supplier_settings
  supplier_bank_name: string;       // АО "ТБанк" г. Москва
  supplier_bik: string;             // 044525974
  supplier_corr_account: string;    // 30101810145250000974
  supplier_inn: string;             // 182707065507
  supplier_kpp?: string;            // обычно пусто у ИП
  supplier_account: string;         // 40802810100004357759
  supplier_legal_name: string;      // ИП Абзалов Никита Львович
  supplier_ogrnip?: string;
  supplier_director_short: string;  // «Абзалов Н.Л.»

  // Buyer (покупатель)
  buyer_legal_form_full: string;    // "Общество с ограниченной ответственностью"
  buyer_name: string;               // "СПИНА"
  buyer_inn: string;
  buyer_kpp?: string;
  buyer_ogrn?: string;
  buyer_address?: string;
  buyer_bank_name?: string;
  buyer_account?: string;
  buyer_bik?: string;
  buyer_corr_account?: string;
  buyer_director_title: string;     // "генерального директора" / "представителя"
  buyer_director_name_genitive: string; // "Иванова И.И." в род. падеже
  buyer_director_basis: string;     // "Устава" / "доверенности №30 от 10.12.2025"
  buyer_director_short: string;     // подпись «Иванов И.И.»
  buyer_email?: string;
  buyer_phone?: string;

  // Items
  items: Array<{ name: string; quantity: number; unit?: string; price: number; total: number }>;
  total_amount: number;

  // Terms
  prepayment_days: number;          // default 5
  shipment_days_after_payment: number; // default 3
  validity_bank_days: number;       // default 5

  // Signature images (optional — для печати PDF с подписью поставщика)
  stamp_img?: string;
  sig_img?: string;
};

const tdHead = 'style="border:1px solid #000;padding:5px 8px;font-size:11px;font-weight:bold;text-align:center"';
const tdBody = 'style="border:1px solid #000;padding:5px 8px;font-size:11px"';
const tdRight = 'style="border:1px solid #000;padding:5px 8px;font-size:11px;text-align:right"';
const tdCenter = 'style="border:1px solid #000;padding:5px 8px;font-size:11px;text-align:center"';

function dash(value: string | undefined | null): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : "—";
}

export function generateInvoiceContractHtml(v: InvoiceContractVars): string {
  const totalAmount = fmtMoney(v.total_amount);
  const itemsRows = v.items.map((item, i) => `
    <tr>
      <td ${tdCenter}>${i + 1}</td>
      <td ${tdBody}>${item.name}</td>
      <td ${tdCenter}>${item.quantity}</td>
      <td ${tdCenter}>${item.unit || "шт"}</td>
      <td ${tdRight}>${fmtMoney(item.price)}</td>
      <td ${tdRight}>${fmtMoney(item.total)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Счёт-договор №${v.contract_number}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#000;margin:15mm 12mm;line-height:1.4}
  h1{font-size:14px;text-align:center;margin:12px 0}
  table{border-collapse:collapse;width:100%}
  .header-table td{padding:4px 8px;font-size:11px;vertical-align:top}
  .header-table .lbl{width:35%;color:#000}
  .sign-block{margin-top:18px;position:relative;min-height:120px}
  .stamp{position:absolute;left:0;top:36px;width:140px;opacity:0.85}
  .signature{position:absolute;left:160px;top:0;width:110px;opacity:0.9}
  @media print{body{margin:10mm 12mm}@page{size:A4}}
  #printBtn button{padding:10px 30px;font-size:14px;background:#0067a5;color:#fff;border:none;border-radius:6px;cursor:pointer}
</style></head><body>

<!-- Шапка: банковские реквизиты получателя -->
<table class="header-table" style="border:1px solid #000;margin-bottom:10px">
  <tr><td class="lbl" style="border-right:1px solid #000">Банк получателя</td><td>${dash(v.supplier_bank_name)}</td></tr>
  <tr><td class="lbl" style="border-right:1px solid #000;border-top:1px solid #000">БИК</td><td style="border-top:1px solid #000">${dash(v.supplier_bik)}</td></tr>
  <tr><td class="lbl" style="border-right:1px solid #000;border-top:1px solid #000">Корр. счёт</td><td style="border-top:1px solid #000">${dash(v.supplier_corr_account)}</td></tr>
  <tr><td class="lbl" style="border-right:1px solid #000;border-top:1px solid #000">ИНН</td><td style="border-top:1px solid #000">${dash(v.supplier_inn)}</td></tr>
  <tr><td class="lbl" style="border-right:1px solid #000;border-top:1px solid #000">КПП</td><td style="border-top:1px solid #000">${v.supplier_kpp || "(не указан)"}</td></tr>
  <tr><td class="lbl" style="border-right:1px solid #000;border-top:1px solid #000">Расчётный счёт</td><td style="border-top:1px solid #000">${dash(v.supplier_account)}</td></tr>
  <tr><td class="lbl" style="border-right:1px solid #000;border-top:1px solid #000">Получатель</td><td style="border-top:1px solid #000"><strong>${dash(v.supplier_legal_name)}</strong></td></tr>
</table>

<h1>Счёт-договор №${v.contract_number} от ${v.date_ru}</h1>

<p style="text-align:justify">${dash(v.supplier_legal_name)} (далее — Поставщик) и ${v.buyer_legal_form_full} «${v.buyer_name}» (далее — Покупатель) в лице ${v.buyer_director_title} ${v.buyer_director_name_genitive}, действующего на основании ${v.buyer_director_basis}, с другой стороны, совместно именуемые «Стороны», заключили счёт-договор (далее — Счёт-договор) о нижеследующем:</p>

<p><strong>Пункт 1.</strong> Поставщик поставляет, а Покупатель принимает и оплачивает товар:</p>

<table style="margin:8px 0 10px 0">
  <thead><tr>
    <th ${tdHead} style="width:30px">№</th>
    <th ${tdHead}>Товары (работы, услуги)</th>
    <th ${tdHead} style="width:60px">Кол-во</th>
    <th ${tdHead} style="width:50px">Ед.</th>
    <th ${tdHead} style="width:100px">Цена</th>
    <th ${tdHead} style="width:110px">Сумма</th>
  </tr></thead>
  <tbody>${itemsRows}</tbody>
</table>

<p style="margin:4px 0"><strong>Итого:</strong> ${totalAmount}</p>
<p style="margin:4px 0"><strong>Без налога (НДС):</strong> —</p>
<p style="margin:4px 0"><strong>Всего к оплате:</strong> ${totalAmount}</p>

<p style="margin-top:10px"><strong>Пункт 2.</strong> Общая сумма Счёта-договора — ${totalAmount}, без НДС.</p>

<p><strong>Пункт 3.</strong> Покупатель в течение ${v.prepayment_days} (${v.prepayment_days === 5 ? "Пяти" : v.prepayment_days === 3 ? "Трёх" : v.prepayment_days === 7 ? "Семи" : v.prepayment_days === 10 ? "Десяти" : v.prepayment_days}) дней перечисляет на расчётный счёт Поставщика полную предоплату — ${totalAmount}. Поставщик в течение ${v.shipment_days_after_payment} (${v.shipment_days_after_payment === 3 ? "Трёх" : v.shipment_days_after_payment === 5 ? "Пяти" : v.shipment_days_after_payment === 7 ? "Семи" : v.shipment_days_after_payment}) рабочих дней после поступления оплаты отправляет товар Покупателю.</p>

<p><strong>Пункт 4.</strong> Счёт-договор действителен в течение ${v.validity_bank_days === 5 ? "пяти" : v.validity_bank_days === 3 ? "трёх" : v.validity_bank_days === 7 ? "семи" : v.validity_bank_days === 10 ? "десяти" : v.validity_bank_days} банковских дней с даты подписания.</p>

<p><strong>Пункт 5.</strong> Счёт-договор составлен в двух экземплярах равной юридической силы, по одному каждой Стороне.</p>

<p><strong>Пункт 6.</strong> Поставщик составляет и направляет Покупателю Универсальный передаточный документ (далее — УПД) посредством электронного документооборота (ЭДО). В случае, если направленный УПД не подписан Покупателем, а письменные мотивированные возражения со стороны Покупателя не получены Поставщиком в течение 10 (десяти) рабочих дней, УПД считается утверждённым Покупателем.</p>

<p style="margin-top:14px"><strong>Пункт 7. Реквизиты Сторон</strong></p>

<table style="border:1px solid #000;margin-top:6px">
  <thead><tr>
    <th ${tdHead} style="width:50%">Исполнитель</th>
    <th ${tdHead} style="width:50%">Заказчик</th>
  </tr></thead>
  <tbody>
    <tr>
      <td ${tdBody} style="vertical-align:top">
        <strong>${dash(v.supplier_legal_name)}</strong><br>
        ${v.supplier_ogrnip ? `ОГРНИП: ${v.supplier_ogrnip}<br>` : ""}
        ИНН: ${dash(v.supplier_inn)}<br>
        Р/с: ${dash(v.supplier_account)}<br>
        Банк: ${dash(v.supplier_bank_name)}<br>
        БИК: ${dash(v.supplier_bik)}<br>
        К/с: ${dash(v.supplier_corr_account)}
      </td>
      <td ${tdBody} style="vertical-align:top">
        <strong>${v.buyer_legal_form_full} «${v.buyer_name}»</strong><br>
        ${v.buyer_director_short ? `${v.buyer_director_title} ${v.buyer_director_short}<br>` : ""}
        ${v.buyer_inn ? `ИНН: ${v.buyer_inn}${v.buyer_kpp ? ` / КПП: ${v.buyer_kpp}` : ""}<br>` : ""}
        ${v.buyer_ogrn ? `ОГРН: ${v.buyer_ogrn}<br>` : ""}
        ${v.buyer_address ? `Адрес: ${v.buyer_address}<br>` : ""}
        ${v.buyer_bank_name ? `Банк: ${v.buyer_bank_name}<br>` : ""}
        ${v.buyer_account ? `Р/с: ${v.buyer_account}<br>` : ""}
        ${v.buyer_bik ? `БИК: ${v.buyer_bik}<br>` : ""}
        ${v.buyer_corr_account ? `К/с: ${v.buyer_corr_account}<br>` : ""}
        ${v.buyer_email ? `E-mail: ${v.buyer_email}<br>` : ""}
        ${v.buyer_phone ? `Тел.: ${v.buyer_phone}` : ""}
      </td>
    </tr>
  </tbody>
</table>

<table style="margin-top:24px;width:100%">
  <tr>
    <td style="width:50%;vertical-align:top">
      <strong>ПОСТАВЩИК</strong><br>
      <div class="sign-block">
        ${v.sig_img ? `<img class="signature" src="${v.sig_img}" />` : ""}
        ${v.stamp_img ? `<img class="stamp" src="${v.stamp_img}" />` : ""}
        <div style="padding-top:18px">___________________ / ${v.supplier_director_short}</div>
      </div>
    </td>
    <td style="width:50%;vertical-align:top">
      <strong>ПОКУПАТЕЛЬ</strong><br>
      <div style="padding-top:54px">___________________ / ${v.buyer_director_short || ""}</div>
    </td>
  </tr>
</table>

<div id="printBtn" style="text-align:center;margin:20px 0">
  <button onclick="this.parentElement.style.display='none';window.print()">Печать / Сохранить PDF</button>
</div>

</body></html>`;
}
