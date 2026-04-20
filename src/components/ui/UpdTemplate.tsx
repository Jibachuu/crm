"use client";

import { formatCurrency } from "@/lib/utils";

interface UpdItem { name: string; quantity: number; unit: string; price: number; total: number }
interface Supplier { legal_name?: string; company_name?: string; address?: string; inn?: string; kpp?: string; director?: string; director_short?: string; ogrnip?: string }
interface UpdData { upd_number: number; upd_date: string; buyer_name: string; buyer_inn: string; buyer_kpp: string; buyer_address: string; basis: string; vat_included: boolean }

export default function UpdTemplate({ upd, items, supplier }: { upd: UpdData; items: UpdItem[]; supplier: Supplier | null }) {
  const total = items.reduce((s, i) => s + i.total, 0);
  const vatRate = upd.vat_included ? 20 : 0;
  const vatAmt = vatRate > 0 ? Math.round(total * vatRate / (100 + vatRate) * 100) / 100 : 0;
  const totalNoVat = total - vatAmt;
  const d = new Date(upd.upd_date);
  const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  const dateText = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} г.`;
  const dateShort = d.toLocaleDateString("ru-RU");
  const sel = supplier ?? {} as Supplier;
  const selName = sel.legal_name || sel.company_name || "";
  const dir = sel.director_short || sel.director || "";
  const ogrnip = sel.ogrnip || "";

  const b = "1px solid #000";
  const f7: React.CSSProperties = { fontSize: 7 };
  const f8: React.CSSProperties = { fontSize: 8 };
  const f6: React.CSSProperties = { fontSize: 6.5 };
  const c = (extra?: React.CSSProperties): React.CSSProperties => ({ border: b, padding: "1px 3px", fontSize: 7.5, verticalAlign: "top", ...extra });

  return (
    <div style={{ width: 1100, minWidth: 1100, fontFamily: "'Times New Roman', Times, serif", fontSize: 8, color: "#000", background: "#fff", padding: "14px 24px", boxSizing: "border-box" }}>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ВЕРХНЯЯ ЧАСТЬ: СЧЁТ-ФАКТУРА                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}

      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup><col style={{ width: 100 }} /><col /><col style={{ width: 28 }} /><col style={{ width: 100 }} /><col /><col style={{ width: 28 }} /></colgroup>
        <tbody>
          {/* Row: УПД title + Счёт-фактура */}
          <tr>
            <td rowSpan={3} style={{ ...f7, verticalAlign: "top", paddingRight: 6 }}>
              <b>Универсальный<br/>передаточный<br/>документ</b>
            </td>
            <td style={f8}>Счёт-фактура № <u><b>&nbsp;{upd.upd_number}&nbsp;</b></u> от <u><b>&nbsp;{dateText}&nbsp;</b></u></td>
            <td style={{ ...f7, color: "#888" }}>(1)</td>
            <td colSpan={3} rowSpan={2} style={{ ...f6, color: "#555", verticalAlign: "top", textAlign: "right" }}>
              Приложение № 1 к постановлению Правительства Российской Федерации от 26 декабря 2011 г. № 1137<br/>
              (в редакции постановления Правительства Российской Федерации от 16 августа 2024 г. № 1096)
            </td>
          </tr>
          <tr>
            <td style={f8}>Исправление № <u>&nbsp;—&nbsp;</u> от <u>&nbsp;—&nbsp;</u></td>
            <td style={{ ...f7, color: "#888" }}>(1а)</td>
          </tr>
          <tr><td colSpan={5}></td></tr>

          {/* Продавец / Покупатель */}
          <tr>
            <td style={{ ...f7, color: "#555" }}>Продавец:</td>
            <td style={f8}>{selName}</td>
            <td style={{ ...f7, color: "#888" }}>(2)</td>
            <td style={{ ...f7, color: "#555" }}>Покупатель:</td>
            <td style={f8}>{upd.buyer_name}</td>
            <td style={{ ...f7, color: "#888" }}>(6)</td>
          </tr>
          <tr>
            <td style={{ ...f7, color: "#555" }}>Адрес:</td>
            <td style={f8}>{sel.address}</td>
            <td style={{ ...f7, color: "#888" }}>(2а)</td>
            <td style={{ ...f7, color: "#555" }}>Адрес:</td>
            <td style={f8}>{upd.buyer_address}</td>
            <td style={{ ...f7, color: "#888" }}>(6а)</td>
          </tr>
          <tr>
            <td style={{ ...f7, color: "#555" }}>ИНН/КПП продавца:</td>
            <td style={f8}>{sel.inn}{sel.kpp ? `/${sel.kpp}` : ""}</td>
            <td style={{ ...f7, color: "#888" }}>(2б)</td>
            <td style={{ ...f7, color: "#555" }}>ИНН/КПП покупателя:</td>
            <td style={f8}>{upd.buyer_inn}{upd.buyer_kpp ? `/${upd.buyer_kpp}` : ""}</td>
            <td style={{ ...f7, color: "#888" }}>(6б)</td>
          </tr>
          <tr>
            <td style={{ ...f7, color: "#555" }}>Грузоотправитель и его адрес:</td>
            <td style={f8}>он же</td>
            <td style={{ ...f7, color: "#888" }}>(3)</td>
            <td style={{ ...f7, color: "#555" }}>Валюта: наименование, код</td>
            <td style={f8}>Российский рубль, 643</td>
            <td style={{ ...f7, color: "#888" }}>(7)</td>
          </tr>
          <tr>
            <td style={{ ...f7, color: "#555" }}>Грузополучатель и его адрес:</td>
            <td style={f8}>{upd.buyer_name}, {upd.buyer_address}</td>
            <td style={{ ...f7, color: "#888" }}>(4)</td>
            <td style={{ ...f7, color: "#555" }}>Идентификатор гос. контракта,</td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td style={{ ...f7, color: "#555" }}>К платёжно-расчётному документу №</td>
            <td style={f8}>— от —</td>
            <td style={{ ...f7, color: "#888" }}>(5)</td>
            <td style={{ ...f7, color: "#555" }}>договора (соглашения) (при наличии):</td>
            <td></td>
            <td style={{ ...f7, color: "#888" }}>(8)</td>
          </tr>
          <tr>
            <td style={{ ...f7, color: "#555" }}>Документ об отгрузке</td>
            <td style={f8}>Универсальный передаточный документ, № {upd.upd_number} от {dateShort}</td>
            <td style={{ ...f7, color: "#888" }}>(5а)</td>
            <td colSpan={3}></td>
          </tr>
        </tbody>
      </table>

      {/* Строка 5б */}
      <div style={{ ...f6, color: "#555", marginTop: 1, marginBottom: 4 }}>
        К счету-фактуре (счетам-фактурам), выставленному (выставленным) при получении оплаты, частичной оплаты или иных платежей
        в счет предстоящих поставок товаров (выполнения работ, оказания услуг), передачи имущественных прав
        <span style={{ ...f7, color: "#888" }}> (5б)</span>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ТАБЛИЦА ТОВАРОВ                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}

      <table style={{ width: "100%", borderCollapse: "collapse", border: b, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 70 }} />{/* Код товара А */}
          <col style={{ width: 20 }} />{/* № п/п 1 */}
          <col />{/* Наименование 1а — flex ~250px */}
          <col style={{ width: 28 }} />{/* Код вида 1б */}
          <col style={{ width: 26 }} />{/* Ед.код 2 */}
          <col style={{ width: 26 }} />{/* Ед.наим 2а */}
          <col style={{ width: 42 }} />{/* Кол-во 3 */}
          <col style={{ width: 62 }} />{/* Цена 4 */}
          <col style={{ width: 68 }} />{/* Без НДС 5 */}
          <col style={{ width: 38 }} />{/* Акциз 6 */}
          <col style={{ width: 42 }} />{/* Ставка 7 */}
          <col style={{ width: 56 }} />{/* Сумма НДС 8 */}
          <col style={{ width: 68 }} />{/* С НДС 9 */}
          <col style={{ width: 30 }} />{/* Страна код 10 */}
          <col style={{ width: 30 }} />{/* Страна наим 10а */}
          <col style={{ width: 60 }} />{/* Рег.номер 11 */}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} style={c({ textAlign: "center", ...f6 })}>Код товара/<br/>работ, услуг</th>
            <th rowSpan={2} style={c({ textAlign: "center", ...f6 })}>№<br/>п/п</th>
            <th rowSpan={2} style={c({ textAlign: "center", ...f6 })}>Наименование товара (описание<br/>выполненных работ, оказанных<br/>услуг), имущественного права</th>
            <th rowSpan={2} style={c({ textAlign: "center", ...f6 })}>Код вида<br/>товара</th>
            <th colSpan={2} style={c({ textAlign: "center", ...f6 })}>Единица<br/>измерения</th>
            <th rowSpan={2} style={c({ textAlign: "center", ...f6 })}>Коли-<br/>чество<br/>(объём)</th>
            <th rowSpan={2} style={c({ textAlign: "center", ...f6 })}>Цена (тариф)<br/>за<br/>единицу<br/>измерения</th>
            <th rowSpan={2} style={c({ textAlign: "center", ...f6 })}>Стоимость<br/>товаров (работ,<br/>услуг), имущест-<br/>венных прав без<br/>налога - всего</th>
            <th rowSpan={2} style={c({ textAlign: "center", ...f6 })}>В том<br/>числе<br/>сумма<br/>акциза</th>
            <th rowSpan={2} style={c({ textAlign: "center", ...f6 })}>Налоговая<br/>ставка</th>
            <th rowSpan={2} style={c({ textAlign: "center", ...f6 })}>Сумма налога,<br/>предъявля-<br/>емая<br/>покупателю</th>
            <th rowSpan={2} style={c({ textAlign: "center", ...f6 })}>Стоимость<br/>товаров (работ,<br/>услуг), имущест-<br/>венных прав с<br/>налогом - всего</th>
            <th colSpan={2} style={c({ textAlign: "center", ...f6 })}>Страна<br/>происхождения<br/>товара</th>
            <th rowSpan={2} style={c({ textAlign: "center", ...f6 })}>Регистрационный<br/>номер декларации<br/>на товары или<br/>рег. номер партии</th>
          </tr>
          <tr>
            <th style={c({ textAlign: "center", ...f6 })}>код</th>
            <th style={c({ textAlign: "center", ...f6 })}>условное<br/>обозна-<br/>чение<br/>(нац.)</th>
            <th style={c({ textAlign: "center", ...f6 })}>цифро-<br/>вой<br/>код</th>
            <th style={c({ textAlign: "center", ...f6 })}>краткое<br/>наимено-<br/>вание</th>
          </tr>
          {/* Column numbers */}
          <tr>
            {["А","1","1а","1б","2","2а","3","4","5","6","7","8","9","10","10а","11"].map((n) => (
              <td key={n} style={c({ textAlign: "center", fontSize: 6, color: "#999" })}>{n}</td>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const iVat = vatRate > 0 ? Math.round(item.total * vatRate / (100 + vatRate) * 100) / 100 : 0;
            const iNoVat = item.total - iVat;
            return (
              <tr key={idx}>
                <td style={c({ textAlign: "center" })}>—</td>
                <td style={c({ textAlign: "center" })}>{idx + 1}</td>
                <td style={c()}>{item.name}</td>
                <td style={c({ textAlign: "center" })}>—</td>
                <td style={c({ textAlign: "center" })}>796</td>
                <td style={c({ textAlign: "center" })}>{item.unit}</td>
                <td style={c({ textAlign: "right" })}>{Number(item.quantity).toFixed(3)}</td>
                <td style={c({ textAlign: "right" })}>{formatCurrency(item.price)}</td>
                <td style={c({ textAlign: "right" })}>{formatCurrency(iNoVat)}</td>
                <td style={c({ textAlign: "center", ...f6 })}>без<br/>акциза</td>
                <td style={c({ textAlign: "center" })}>{vatRate > 0 ? `${vatRate}%` : "—"}</td>
                <td style={c({ textAlign: "center" })}>{vatRate > 0 ? formatCurrency(iVat) : "—"}</td>
                <td style={c({ textAlign: "right" })}>{formatCurrency(item.total)}</td>
                <td style={c({ textAlign: "center" })}>—</td>
                <td style={c({ textAlign: "center" })}>—</td>
                <td style={c({ textAlign: "center" })}>—</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={8} style={c({ textAlign: "right", fontWeight: 700 })}>Всего к оплате (9)</td>
            <td style={c({ textAlign: "right", fontWeight: 700 })}>{formatCurrency(totalNoVat)}</td>
            <td style={c({ textAlign: "center" })}>X</td>
            <td style={c()}></td>
            <td style={c({ textAlign: "center" })}>{vatRate > 0 ? formatCurrency(vatAmt) : "—"}</td>
            <td style={c({ textAlign: "right", fontWeight: 700 })}>{formatCurrency(total)}</td>
            <td style={c()}></td>
            <td style={c()}></td>
            <td style={c()}></td>
          </tr>
        </tfoot>
      </table>

      {/* Подписи под таблицей */}
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginTop: 4 }}>
        <colgroup><col style={{ width: 90 }} /><col /><col /><col style={{ width: 10 }} /><col /><col /></colgroup>
        <tbody>
          <tr>
            <td style={{ ...f7, verticalAlign: "top" }}>Документ<br/>составлен на<br/>1 листе</td>
            <td style={f7}>Руководитель организации<br/>или иное уполномоченное лицо</td>
            <td style={{ borderBottom: b, ...f7, textAlign: "center" }}></td>
            <td></td>
            <td style={f7}>Главный бухгалтер<br/>или иное уполномоченное лицо</td>
            <td style={{ borderBottom: b, ...f7, textAlign: "center" }}></td>
          </tr>
          <tr>
            <td></td>
            <td style={{ ...f6, color: "#888", textAlign: "center" }}></td>
            <td style={{ ...f6, color: "#888", textAlign: "center" }}>(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(ф.и.о.)</td>
            <td></td>
            <td></td>
            <td style={{ ...f6, color: "#888", textAlign: "center" }}>(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(ф.и.о.)</td>
          </tr>
          <tr>
            <td></td>
            <td style={f7}>Индивидуальный предприниматель<br/>или иное уполномоченное лицо</td>
            <td style={f8}>{dir}</td>
            <td></td>
            <td colSpan={2} style={f7}>ОГРНИП {ogrnip || "_______________"}, дата регистрации _______________</td>
          </tr>
          <tr>
            <td></td>
            <td></td>
            <td style={{ ...f6, color: "#888", textAlign: "center" }}>(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(ф.и.о.)</td>
            <td></td>
            <td colSpan={2} style={{ ...f6, color: "#888" }}>(основной государственный регистрационный номер<br/>индивидуального предпринимателя и дата присвоения такого номера)</td>
          </tr>
        </tbody>
      </table>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* НИЖНЯЯ ЧАСТЬ: УПД                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}

      <table style={{ width: "100%", borderCollapse: "collapse", border: b, tableLayout: "fixed", marginTop: 6 }}>
        <colgroup><col style={{ width: "50%" }} /><col style={{ width: "50%" }} /></colgroup>
        <tbody>
          {/* Основание */}
          <tr>
            <td colSpan={2} style={c({ padding: "3px 4px" })}>
              <span style={{ ...f7, color: "#555" }}>Основание передачи (сдачи) / получения (приёмки)</span>
              <span style={{ marginLeft: 8, ...f8 }}>{upd.basis}</span>
              <span style={{ float: "right", ...f7, color: "#888" }}>[8]</span>
              <br/><span style={{ ...f6, color: "#888" }}>(договор; доверенность и др.)</span>
            </td>
          </tr>
          {/* Транспортировка */}
          <tr>
            <td colSpan={2} style={c({ padding: "3px 4px" })}>
              <span style={{ ...f7, color: "#555" }}>Данные о транспортировке и грузе</span>
              <span style={{ float: "right", ...f7, color: "#888" }}>[9]</span>
              <br/><span style={{ ...f6, color: "#888" }}>(транспортная накладная, поручение экспедитору, экспедиторская / складская расписка и др. / масса нетто/ брутто груза...)</span>
            </td>
          </tr>
          {/* Передал / Получил */}
          <tr>
            <td style={c({ padding: "3px 4px" })}>
              <b style={f7}>Товар (груз) передал / услуги, результаты работ, права сдал</b>
              <span style={{ float: "right", ...f7, color: "#888" }}>[10]</span>
              <br/><span style={{ ...f6, color: "#888" }}>(должность)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(ф.и.о.)</span>
            </td>
            <td style={c({ padding: "3px 4px" })}>
              <b style={f7}>Товар (груз) получил / услуги, результаты работ, права принял</b>
              <span style={{ float: "right", ...f7, color: "#888" }}>[15]</span>
              <br/><span style={{ ...f6, color: "#888" }}>(должность)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(ф.и.о.)</span>
            </td>
          </tr>
          {/* Дата */}
          <tr>
            <td style={c({ padding: "3px 4px" })}>
              <span style={f7}>Дата отгрузки, передачи (сдачи)</span> <span style={f8}>«<b>{d.getDate() < 10 ? `0${d.getDate()}` : d.getDate()}</b>» <b>{months[d.getMonth()]}</b> <b>{d.getFullYear()}</b> года</span>
              <span style={{ float: "right", ...f7, color: "#888" }}>[11]</span>
            </td>
            <td style={c({ padding: "3px 4px" })}>
              <span style={f7}>Дата получения (приёмки)</span> <span style={f8}>«&nbsp;&nbsp;&nbsp;» _____________ 20__ года</span>
              <span style={{ float: "right", ...f7, color: "#888" }}>[16]</span>
            </td>
          </tr>
          {/* Иные сведения */}
          <tr>
            <td style={c({ padding: "3px 4px" })}>
              <span style={{ ...f7, color: "#555" }}>Иные сведения об отгрузке, передаче</span>
              <span style={{ float: "right", ...f7, color: "#888" }}>[12]</span>
            </td>
            <td style={c({ padding: "3px 4px" })}>
              <span style={{ ...f7, color: "#555" }}>Иные сведения о получении, приёмке</span>
              <span style={{ float: "right", ...f7, color: "#888" }}>[17]</span>
            </td>
          </tr>
          {/* Ответственный */}
          <tr>
            <td style={c({ padding: "3px 4px" })}>
              <span style={{ ...f7, color: "#555" }}>Ответственный за правильность оформления факта хозяйственной жизни</span>
              <span style={{ float: "right", ...f7, color: "#888" }}>[13]</span>
              <br/><span style={f8}>Индивидуальный<br/>предприниматель</span>
              <span style={{ marginLeft: 12, ...f8 }}>{dir}</span>
              <br/><span style={{ ...f6, color: "#888" }}>(должность)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(ф.и.о.)</span>
            </td>
            <td style={c({ padding: "3px 4px" })}>
              <span style={{ ...f7, color: "#555" }}>Ответственный за правильность оформления факта хозяйственной жизни</span>
              <span style={{ float: "right", ...f7, color: "#888" }}>[18]</span>
              <br/><br/><span style={{ ...f6, color: "#888" }}>(должность)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(ф.и.о.)</span>
            </td>
          </tr>
          {/* Наименование субъекта */}
          <tr>
            <td style={c({ padding: "3px 4px" })}>
              <span style={{ ...f7, color: "#555" }}>Наименование экономического субъекта – составителя документа (в т.ч. комиссионера / агента)</span>
              <span style={{ float: "right", ...f7, color: "#888" }}>[14]</span>
              <br/><span style={f8}>{selName}, ИНН {sel.inn}</span>
              <br/><span style={{ ...f6, color: "#888" }}>(может не заполняться при проставлении печати в М.П., может быть указан ИНН / КПП)</span>
            </td>
            <td style={c({ padding: "3px 4px" })}>
              <span style={{ ...f7, color: "#555" }}>Наименование экономического субъекта – составителя документа</span>
              <span style={{ float: "right", ...f7, color: "#888" }}>[19]</span>
              <br/><span style={f8}>{upd.buyer_name}, ИНН/КПП {upd.buyer_inn}{upd.buyer_kpp ? `/${upd.buyer_kpp}` : ""}</span>
              <br/><span style={{ ...f6, color: "#888" }}>(может не заполняться при проставлении печати в М.П., может быть указан ИНН / КПП)</span>
            </td>
          </tr>
          {/* М.П. */}
          <tr>
            <td style={c({ padding: "4px", height: 20 })}>М.П.</td>
            <td style={c({ padding: "4px", height: 20 })}>М.П.</td>
          </tr>
        </tbody>
      </table>

    </div>
  );
}
