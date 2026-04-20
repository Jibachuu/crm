"use client";

import { formatCurrency } from "@/lib/utils";
import { amountToWords } from "@/lib/numToWords";

interface UpdItem { name: string; quantity: number; unit: string; price: number; total: number }
interface Supplier { legal_name?: string; company_name?: string; address?: string; inn?: string; kpp?: string; director?: string; director_short?: string; ogrnip?: string }
interface UpdData { upd_number: number; upd_date: string; buyer_name: string; buyer_inn: string; buyer_kpp: string; buyer_address: string; basis: string; vat_included: boolean }

const S = {
  page: { width: 794, fontFamily: "'Times New Roman', Times, serif", fontSize: 9, color: "#000", background: "#fff", padding: "20px 28px", boxSizing: "border-box" as const },
  // table helpers
  tbl: { width: "100%", borderCollapse: "collapse" as const, tableLayout: "fixed" as const },
  b: "1px solid #000",
  cell: (extra?: React.CSSProperties): React.CSSProperties => ({ border: "1px solid #000", padding: "2px 4px", fontSize: 8, verticalAlign: "top", ...extra }),
  hdr: (extra?: React.CSSProperties): React.CSSProperties => ({ border: "1px solid #000", padding: "2px 3px", fontSize: 7, fontWeight: 400, textAlign: "center", verticalAlign: "top", ...extra }),
  lbl: { fontSize: 7, color: "#555" } as React.CSSProperties,
  line: { borderBottom: "1px solid #000" } as React.CSSProperties,
};

export default function UpdTemplate({ upd, items, supplier }: { upd: UpdData; items: UpdItem[]; supplier: Supplier | null }) {
  const total = items.reduce((s, i) => s + i.total, 0);
  const vatRate = upd.vat_included ? 20 : 0;
  const vatAmount = vatRate > 0 ? Math.round(total * vatRate / (100 + vatRate) * 100) / 100 : 0;
  const totalNoVat = total - vatAmount;
  const d = new Date(upd.upd_date);
  const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  const dateStr = `«${d.getDate()}» ${months[d.getMonth()]} ${d.getFullYear()} г.`;
  const sel = supplier ?? {} as Supplier;
  const selName = sel.legal_name || sel.company_name || "";
  const dir = sel.director_short || sel.director || "";

  return (
    <div style={S.page}>
      {/* ════════════════ СЧЁТ-ФАКТУРА (верхняя часть) ════════════════ */}

      {/* Строка 1: Счёт-фактура + Приложение */}
      <table style={{ ...S.tbl, marginBottom: 4 }}>
        <colgroup><col style={{ width: "60%" }} /><col style={{ width: "40%" }} /></colgroup>
        <tbody><tr>
          <td style={{ fontSize: 10, padding: "0 0 2px" }}>
            Счёт-фактура № <b><u>&nbsp;{upd.upd_number}&nbsp;</u></b> от <b><u>&nbsp;{dateStr}&nbsp;</u></b>
          </td>
          <td style={{ fontSize: 6.5, textAlign: "right", color: "#555", verticalAlign: "top" }}>
            Приложение № 1 к постановлению Правительства Российской Федерации от 26 декабря 2011 г. № 1137
            <br/>(в ред. постановления Правительства РФ от 02.04.2021 № 534)
          </td>
        </tr></tbody>
      </table>

      {/* Строки реквизитов — двухколоночная таблица */}
      <table style={{ ...S.tbl, fontSize: 8, marginBottom: 2 }}>
        <colgroup><col style={{ width: "50%" }} /><col style={{ width: "50%" }} /></colgroup>
        <tbody>
          <tr>
            <td style={{ padding: "1px 0" }}><span style={S.lbl}>Продавец: </span>{selName}</td>
            <td style={{ padding: "1px 0" }}><span style={S.lbl}>Покупатель: </span>{upd.buyer_name}</td>
          </tr>
          <tr>
            <td style={{ padding: "1px 0" }}><span style={S.lbl}>Адрес: </span>{sel.address}</td>
            <td style={{ padding: "1px 0" }}><span style={S.lbl}>Адрес: </span>{upd.buyer_address}</td>
          </tr>
          <tr>
            <td style={{ padding: "1px 0" }}><span style={S.lbl}>ИНН/КПП продавца: </span>{sel.inn}{sel.kpp ? `/${sel.kpp}` : ""}</td>
            <td style={{ padding: "1px 0" }}><span style={S.lbl}>ИНН/КПП покупателя: </span>{upd.buyer_inn}{upd.buyer_kpp ? `/${upd.buyer_kpp}` : ""}</td>
          </tr>
          <tr>
            <td style={{ padding: "1px 0" }}><span style={S.lbl}>Грузоотправитель и его адрес: </span>он же</td>
            <td></td>
          </tr>
          <tr>
            <td colSpan={2} style={{ padding: "1px 0" }}><span style={S.lbl}>Грузополучатель и его адрес: </span>{upd.buyer_name}, {upd.buyer_address}</td>
          </tr>
          <tr>
            <td colSpan={2} style={{ padding: "1px 0" }}><span style={S.lbl}>К платёжно-расчётному документу № </span>— <span style={S.lbl}>от </span>—</td>
          </tr>
        </tbody>
      </table>

      {/* ════════════════ ТАБЛИЦА ТОВАРОВ ════════════════ */}
      <table style={{ ...S.tbl, border: S.b, marginTop: 4 }}>
        <colgroup>
          <col style={{ width: 22 }} />{/* № */}
          <col />{/* Наименование — flex */}
          <col style={{ width: 30 }} />{/* код ед */}
          <col style={{ width: 30 }} />{/* наим ед */}
          <col style={{ width: 36 }} />{/* кол-во */}
          <col style={{ width: 56 }} />{/* цена */}
          <col style={{ width: 64 }} />{/* без НДС */}
          <col style={{ width: 50 }} />{/* акциз */}
          <col style={{ width: 40 }} />{/* ставка */}
          <col style={{ width: 56 }} />{/* сумма НДС */}
          <col style={{ width: 64 }} />{/* с НДС */}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} style={S.hdr()}>№</th>
            <th rowSpan={2} style={S.hdr({ textAlign: "left" })}>Наименование товара (описание выполненных работ, оказанных услуг), имущественного права</th>
            <th colSpan={2} style={S.hdr()}>Единица<br/>измерения</th>
            <th rowSpan={2} style={S.hdr()}>Кол-во<br/>(объём)</th>
            <th rowSpan={2} style={S.hdr()}>Цена (тариф)<br/>за единицу</th>
            <th rowSpan={2} style={S.hdr()}>Стоимость<br/>товаров без<br/>налога, всего</th>
            <th rowSpan={2} style={S.hdr()}>В том числе<br/>сумма акциза</th>
            <th rowSpan={2} style={S.hdr()}>Налоговая<br/>ставка</th>
            <th rowSpan={2} style={S.hdr()}>Сумма<br/>налога</th>
            <th rowSpan={2} style={S.hdr()}>Стоимость<br/>товаров с<br/>налогом, всего</th>
          </tr>
          <tr>
            <th style={S.hdr({ fontSize: 6 })}>код</th>
            <th style={S.hdr({ fontSize: 6 })}>усл. обозн.</th>
          </tr>
          <tr>
            {["1","2","2а","3","4","5","6","7","8","9","10"].map((n) => (
              <td key={n} style={{ ...S.cell({ textAlign: "center", fontSize: 6, color: "#999" }) }}>{n}</td>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const iVat = vatRate > 0 ? Math.round(item.total * vatRate / (100 + vatRate) * 100) / 100 : 0;
            const iNoVat = item.total - iVat;
            return (
              <tr key={idx}>
                <td style={S.cell({ textAlign: "center" })}>{idx + 1}</td>
                <td style={S.cell()}>{item.name}</td>
                <td style={S.cell({ textAlign: "center" })}>796</td>
                <td style={S.cell({ textAlign: "center" })}>{item.unit}</td>
                <td style={S.cell({ textAlign: "center" })}>{item.quantity}</td>
                <td style={S.cell({ textAlign: "right" })}>{formatCurrency(item.price)}</td>
                <td style={S.cell({ textAlign: "right" })}>{formatCurrency(iNoVat)}</td>
                <td style={S.cell({ textAlign: "center", fontSize: 6.5 })}>без акциза</td>
                <td style={S.cell({ textAlign: "center" })}>{vatRate > 0 ? `${vatRate}%` : "Без НДС"}</td>
                <td style={S.cell({ textAlign: "right" })}>{vatRate > 0 ? formatCurrency(iVat) : "—"}</td>
                <td style={S.cell({ textAlign: "right" })}>{formatCurrency(item.total)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} style={S.cell({ textAlign: "right", fontWeight: 700 })}>Всего к оплате:</td>
            <td style={S.cell({ textAlign: "right", fontWeight: 700 })}>{formatCurrency(totalNoVat)}</td>
            <td style={S.cell({ textAlign: "center" })}>X</td>
            <td style={S.cell()}></td>
            <td style={S.cell({ textAlign: "right", fontWeight: 700 })}>{vatRate > 0 ? formatCurrency(vatAmount) : "—"}</td>
            <td style={S.cell({ textAlign: "right", fontWeight: 700 })}>{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Подписи под таблицей */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 7 }}>
        <div><span style={S.lbl}>Документ составил:</span></div>
        <div><span style={S.lbl}>Руководитель организации</span><br/><span style={S.lbl}>или иное уполномоченное лицо:</span> <span style={S.line}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></div>
        <div><span style={S.lbl}>Главный бухгалтер</span><br/><span style={S.lbl}>или иное уполномоченное лицо:</span> <span style={S.line}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></div>
      </div>

      <div style={{ fontSize: 8, marginTop: 6 }}>
        Индивидуальный предприниматель <span style={S.line}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> {dir}
      </div>

      {/* ════════════════ НИЖНЯЯ ЧАСТЬ: УПД ════════════════ */}
      <table style={{ ...S.tbl, border: "2px solid #000", marginTop: 8 }}>
        <colgroup><col style={{ width: "50%" }} /><col style={{ width: "50%" }} /></colgroup>
        <tbody>
          {/* Основание / Транспортировка */}
          <tr>
            <td style={S.cell()}>
              <span style={S.lbl}>Основание передачи (сдачи) / получения (приёмки):</span><br/>
              <b>{upd.basis}</b>
            </td>
            <td style={S.cell()}>
              <span style={S.lbl}>Данные о транспортировке и грузе:</span><br/>—
            </td>
          </tr>

          {/* Передал / Получил */}
          <tr>
            <td style={S.cell({ padding: "4px 6px" })}>
              <b style={{ fontSize: 7.5 }}>Товар (груз) передал / услуги, результаты работ, права сдал</b>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 8 }}>
                <div style={{ flex: 1, ...S.line, height: 14 }} />
                <span style={{ fontSize: 8 }}>{dir}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 7 }}>
                Дата отгрузки, передачи (сдачи) «<u>&nbsp;&nbsp;&nbsp;</u>» <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> {d.getFullYear()} года
              </div>
            </td>
            <td style={S.cell({ padding: "4px 6px" })}>
              <b style={{ fontSize: 7.5 }}>Товар (груз) получил / услуги, результаты работ, права принял</b>
              <div style={{ ...S.line, height: 14, marginTop: 8 }} />
              <div style={{ marginTop: 6, fontSize: 7 }}>
                Дата получения (приёмки) «<u>&nbsp;&nbsp;&nbsp;</u>» <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> года
              </div>
            </td>
          </tr>

          {/* Иные сведения */}
          <tr>
            <td style={S.cell()}><span style={S.lbl}>Иные сведения об отгрузке, передаче:</span> —</td>
            <td style={S.cell()}><span style={S.lbl}>Иные сведения о получении, приёмке:</span> —</td>
          </tr>

          {/* Ответственный */}
          <tr>
            <td style={S.cell({ padding: "4px 6px" })}>
              <span style={{ ...S.lbl, fontSize: 6.5 }}>Ответственный за правильность оформления факта хозяйственной жизни:</span>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 4 }}>
                <div style={{ flex: 1, ...S.line, height: 12 }} />
                <span style={{ fontSize: 7.5 }}>{dir}</span>
              </div>
            </td>
            <td style={S.cell({ padding: "4px 6px" })}>
              <span style={{ ...S.lbl, fontSize: 6.5 }}>Ответственный за правильность оформления факта хозяйственной жизни:</span>
              <div style={{ ...S.line, height: 12, marginTop: 4 }} />
            </td>
          </tr>

          {/* Наименование субъекта */}
          <tr>
            <td style={S.cell()}>
              <span style={{ ...S.lbl, fontSize: 6.5 }}>Наименование экономического субъекта — составителя документа (в т.ч. комиссионера / агента):</span><br/>
              <span style={{ fontSize: 8 }}>{selName}</span><br/>
              <span style={{ fontSize: 7 }}>ИНН {sel.inn}</span>
            </td>
            <td style={S.cell()}>
              <span style={{ ...S.lbl, fontSize: 6.5 }}>Наименование экономического субъекта — составителя документа:</span><br/>
              <span style={{ fontSize: 8 }}>{upd.buyer_name}</span><br/>
              <span style={{ fontSize: 7 }}>ИНН {upd.buyer_inn}</span>
            </td>
          </tr>

          {/* М.П. */}
          <tr>
            <td style={S.cell({ height: 20 })}>М.П.</td>
            <td style={S.cell({ height: 20 })}>М.П.</td>
          </tr>
        </tbody>
      </table>

      {sel.ogrnip && (
        <div style={{ fontSize: 7, marginTop: 4 }}>ОГРНИП {sel.ogrnip}, дата регистрации _______________</div>
      )}
    </div>
  );
}
