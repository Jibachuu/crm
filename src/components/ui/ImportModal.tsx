"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import Modal from "./Modal";
import Button from "./Button";
import { Upload, ChevronRight, ChevronLeft, CheckCircle, AlertCircle, Loader } from "lucide-react";

type Entity = "companies" | "contacts" | "leads" | "deals" | "products";

interface CrmField {
  key: string;
  label: string;
  required?: boolean;
}

const ENTITY_FIELDS: Record<Entity, CrmField[]> = {
  companies: [
    { key: "name", label: "Название", required: true },
    { key: "inn", label: "ИНН" },
    { key: "ogrn", label: "ОГРН" },
    { key: "kpp", label: "КПП" },
    { key: "legal_address", label: "Юридический адрес" },
    { key: "city", label: "Город" },
    { key: "region", label: "Регион" },
    { key: "director", label: "Ген. директор" },
    { key: "phone", label: "Телефон" },
    { key: "email", label: "Email" },
    { key: "website", label: "Сайт" },
    { key: "activity", label: "Деятельность" },
    { key: "need", label: "Потребность" },
    { key: "description", label: "Комментарий" },
    { key: "assigned_to_name", label: "Ответственный" },
    { key: "created_at", label: "Дата создания" },
  ],
  contacts: [
    { key: "full_name", label: "ФИО (полное)" },
    { key: "last_name", label: "Фамилия" },
    { key: "first_name", label: "Имя" },
    { key: "middle_name", label: "Отчество" },
    { key: "position", label: "Должность" },
    { key: "company_name", label: "Компания" },
    { key: "phone", label: "Телефон рабочий" },
    { key: "phone_mobile", label: "Телефон мобильный" },
    { key: "phone_other", label: "Другой телефон" },
    { key: "email", label: "Email рабочий" },
    { key: "email_other", label: "Email другой" },
    { key: "telegram_username", label: "Telegram username" },
    { key: "telegram_id", label: "Telegram ID" },
    { key: "description", label: "Комментарий" },
    { key: "assigned_to_name", label: "Ответственный" },
    { key: "created_at", label: "Дата создания" },
  ],
  leads: [
    { key: "title", label: "Название", required: true },
    { key: "status", label: "Статус" },
    { key: "source", label: "Источник" },
    { key: "company_name", label: "Компания" },
    { key: "contact_name", label: "Контакт (имя)" },
    { key: "contact_phone", label: "Телефон контакта" },
    { key: "contact_email", label: "Email контакта" },
    { key: "telegram_username", label: "Telegram контакта" },
    { key: "had_call", label: "Был ли звонок" },
    { key: "description", label: "Комментарий" },
    { key: "assigned_to_name", label: "Ответственный" },
    { key: "created_at", label: "Дата создания" },
  ],
  deals: [
    { key: "title", label: "Название", required: true },
    { key: "stage", label: "Стадия" },
    { key: "source", label: "Источник" },
    { key: "amount", label: "Сумма итого" },
    { key: "company_name", label: "Компания" },
    { key: "contact_name", label: "Контакт (имя)" },
    { key: "contact_phone", label: "Телефон контакта" },
    { key: "contact_email", label: "Email контакта" },
    ...Array.from({ length: 10 }, (_, i) => [
      { key: `product_${i + 1}_category`, label: `Товар ${i + 1} — категория` },
      { key: `product_${i + 1}_subcategory`, label: `Товар ${i + 1} — подкатегория` },
      { key: `product_${i + 1}_name`, label: `Товар ${i + 1} — название` },
      { key: `product_${i + 1}_sku`, label: `Товар ${i + 1} — артикул` },
      { key: `product_${i + 1}_volume`, label: `Товар ${i + 1} — объём` },
      { key: `product_${i + 1}_aroma`, label: `Товар ${i + 1} — аромат` },
      { key: `product_${i + 1}_qty`, label: `Товар ${i + 1} — кол-во` },
      { key: `product_${i + 1}_price`, label: `Товар ${i + 1} — цена за шт` },
      { key: `product_${i + 1}_total`, label: `Товар ${i + 1} — сумма` },
    ]).flat(),
    { key: "description", label: "Комментарий" },
    { key: "assigned_to_name", label: "Ответственный" },
    { key: "created_at", label: "Дата создания" },
  ],
  products: [
    { key: "name", label: "Название", required: true },
    { key: "sku", label: "Артикул", required: true },
    { key: "base_price", label: "Базовая цена", required: true },
    { key: "description", label: "Описание" },
  ],
};

// Extra aliases for fields whose key/label don't match common file column names
const FIELD_ALIASES: Record<string, string[]> = {
  assigned_to_name: ["ответственный", "ответственная", "менеджер", "менеджер по продажам", "responsible", "owner", "assigned"],
  company_name: ["компания", "организация", "фирма", "company"],
  contact_name: ["контакт", "фио", "клиент", "contact"],
  full_name: ["фио", "имя", "full name", "имя фамилия"],
  created_at: ["дата", "дата создания", "created at", "date"],
  amount: ["сумма", "сумма итого", "сумма итого (посчитана из товаров)", "total", "amount"],
};

// Auto-match file columns to CRM fields by similarity
function autoMatch(fileHeaders: string[], fields: CrmField[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  function n(s: string) { return s.toLowerCase().replace(/[—–-]/g, "-").replace(/\s+/g, " ").trim(); }

  // Pass 1: exact matches (label or key or alias)
  for (const field of fields) {
    const label = n(field.label);
    const key = n(field.key);
    const aliases = (FIELD_ALIASES[field.key] ?? []).map(n);
    for (const header of fileHeaders) {
      if (used.has(header)) continue;
      const h = n(header);
      if (h === label || h === key || aliases.includes(h)) {
        mapping[field.key] = header;
        used.add(header);
        break;
      }
    }
  }

  // Pass 2: product slot matching — "Товар N — категория/подкатегория/название/артикул/объём/аромат/кол-во/цена/сумма"
  for (const header of fileHeaders) {
    if (used.has(header)) continue;
    const h = n(header);
    const pm = h.match(/товар\s*(\d+)\s*[-—]\s*(категория|подкатегория|название|артикул|объ[её]м|аромат|кол[- ]?во|цена за шт|цена|сумма)/);
    if (pm) {
      const num = pm[1];
      const type = pm[2];
      let key = "";
      if (type.startsWith("подкатегор")) key = `product_${num}_subcategory`;
      else if (type.startsWith("категор")) key = `product_${num}_category`;
      else if (type.startsWith("назван")) key = `product_${num}_name`;
      else if (type.startsWith("артикул")) key = `product_${num}_sku`;
      else if (type.startsWith("объ")) key = `product_${num}_volume`;
      else if (type.startsWith("аромат")) key = `product_${num}_aroma`;
      else if (type.startsWith("кол")) key = `product_${num}_qty`;
      else if (type.startsWith("цена")) key = `product_${num}_price`;
      else if (type.startsWith("сумм")) key = `product_${num}_total`;
      if (key && !mapping[key]) {
        mapping[key] = header;
        used.add(header);
      }
    }
  }

  // Pass 3: fuzzy (substring) matches for non-product fields only
  for (const field of fields) {
    if (mapping[field.key]) continue;
    if (field.key.startsWith("product_")) continue; // skip product slots — handled above
    const label = n(field.label);
    const aliases = (FIELD_ALIASES[field.key] ?? []).map(n);
    for (const header of fileHeaders) {
      if (used.has(header)) continue;
      const h = n(header);
      const matched =
        h.includes(label) || label.includes(h) ||
        aliases.some((a) => h.includes(a) || a.includes(h));
      if (matched) {
        mapping[field.key] = header;
        used.add(header);
        break;
      }
    }
  }

  return mapping;
}

interface Props {
  open: boolean;
  onClose: () => void;
  entity: Entity;
  onImported?: (count: number) => void;
}

type ImportMode = "skip" | "update";

const ENTITY_LABELS: Record<Entity, string> = {
  companies: "компаний",
  contacts: "контактов",
  leads: "лидов",
  deals: "сделок",
  products: "товаров",
};

export default function ImportModal({ open, onClose, entity, onImported }: Props) {
  const [step, setStep] = useState(1);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<ImportMode>("update");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number; errors: string[]; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  const fields = ENTITY_FIELDS[entity] ?? [];

  function reset() {
    setStep(1);
    setFileHeaders([]);
    setFileRows([]);
    setMapping({});
    setResult(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  const resultRef = useRef(result);
  resultRef.current = result;

  function handleClose() {
    const hadImport = resultRef.current && (resultRef.current.added > 0 || resultRef.current.updated > 0);
    reset();
    onClose();
    if (hadImport) onImported?.(1);
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })
      .filter((row) => Object.values(row).some((v) => v !== "" && v !== null && v !== undefined));
    if (rows.length === 0) { alert("Файл пустой"); return; }
    const headers = Object.keys(rows[0]);
    setFileHeaders(headers);
    setFileRows(rows);
    setMapping(autoMatch(headers, fields));
    setStep(2);
  }

  // Apply mapping to get preview rows
  function applyMapping(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const field of fields) {
        const col = mapping[field.key];
        if (col && row[col] !== undefined && row[col] !== "") {
          out[field.key] = row[col];
        }
      }
      return out;
    });
  }

  async function handleImport() {
    setLoading(true);
    const mapped = applyMapping(fileRows);
    try {
    // For products entity, use the old API
    if (entity === "products") {
      const res = await fetch(`/api/import/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mapped }),
      });
      const data = await res.json();
      setResult({ added: data.added ?? 0, updated: 0, skipped: 0, errors: data.errors ?? [], total: fileRows.length });
      if (data.added > 0) onImported?.(data.added);
    } else {
      const res = await fetch("/api/import/smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, rows: mapped, mode }),
      });
      const data = await res.json();
      setResult(data);
    }

    } catch (err) {
      console.error("IMPORT ERROR:", err);
      setResult({ added: 0, updated: 0, skipped: 0, errors: [`Ошибка запроса: ${err}`], total: fileRows.length });
    }
    setLoading(false);
    setStep(4);
  }

  const previewRows = applyMapping(fileRows.slice(0, 5));
  const previewFields = fields.filter((f) => mapping[f.key]);

  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.04em" };
  const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "5px 8px", fontSize: 12, width: "100%", background: "#fff" };

  return (
    <Modal open={open} onClose={handleClose} title={`Импорт ${ENTITY_LABELS[entity]}`} size="lg">
      <div className="p-5">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-5">
          {["Файл", "Маппинг", "Превью", "Результат"].map((label, idx) => {
            const n = idx + 1;
            const done = step > n;
            const active = step === n;
            return (
              <div key={n} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: done ? "#2e7d32" : active ? "#0067a5" : "#e0e0e0", color: done || active ? "#fff" : "#888" }}>
                    {done ? "✓" : n}
                  </div>
                  <span className="text-xs font-medium" style={{ color: active ? "#0067a5" : done ? "#2e7d32" : "#aaa" }}>{label}</span>
                </div>
                {idx < 3 && <div className="flex-1 h-px" style={{ background: step > n ? "#2e7d32" : "#e0e0e0", minWidth: 24 }} />}
              </div>
            );
          })}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div>
            <div
              className="flex flex-col items-center justify-center py-12 cursor-pointer transition-colors rounded-lg"
              style={{ border: "2px dashed #d0d0d0", background: "#fafafa" }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <Upload size={32} className="mb-3" style={{ color: "#ccc" }} />
              <p className="text-sm font-medium" style={{ color: "#555" }}>Перетащите файл или нажмите для выбора</p>
              <p className="text-xs mt-1" style={{ color: "#aaa" }}>Поддерживается .xlsx, .xls, .csv</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          </div>
        )}

        {/* Step 2: Mapping */}
        {step === 2 && (
          <div>
            <p className="text-xs mb-3" style={{ color: "#888" }}>
              Файл: <strong>{fileName}</strong> · {fileRows.length} строк · {fileHeaders.length} колонок
            </p>
            <p className="text-xs mb-4" style={{ color: "#666" }}>
              Укажите какая колонка файла соответствует каждому полю CRM. Пропустите ненужные.
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 max-h-[50vh] overflow-y-auto">
              {fields.map((field) => (
                <div key={field.key}>
                  <label style={labelStyle}>
                    {field.label}{field.required && <span style={{ color: "#d32f2f" }}> *</span>}
                  </label>
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">— не импортировать —</option>
                    {fileHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {/* Duplicate mode */}
            <div className="mt-4 p-3 rounded" style={{ background: "#f5f5f5", border: "1px solid #e0e0e0" }}>
              <p className="text-xs font-semibold mb-2" style={{ color: "#555" }}>При совпадении записи:</p>
              <div className="flex gap-3">
                {([
                  { value: "update", label: "Обновить", desc: "Дополнить существующую новыми данными" },
                  { value: "skip", label: "Пропустить", desc: "Не трогать существующую запись" },
                ] as { value: ImportMode; label: string; desc: string }[]).map((opt) => (
                  <label key={opt.value} className="flex items-start gap-2 cursor-pointer flex-1 p-2 rounded"
                    style={{ border: `1px solid ${mode === opt.value ? "#0067a5" : "#ddd"}`, background: mode === opt.value ? "#e8f4fd" : "#fff" }}>
                    <input type="radio" name="mode" value={opt.value} checked={mode === opt.value}
                      onChange={() => setMode(opt.value)} className="mt-0.5" style={{ accentColor: "#0067a5" }} />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "#333" }}>{opt.label}</p>
                      <p className="text-xs" style={{ color: "#888" }}>{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-between mt-4">
              <Button size="sm" variant="secondary" onClick={() => setStep(1)}><ChevronLeft size={13} /> Назад</Button>
              <Button size="sm" onClick={() => setStep(3)}>Превью <ChevronRight size={13} /></Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && (
          <div>
            <p className="text-xs mb-3" style={{ color: "#666" }}>
              Первые {Math.min(5, fileRows.length)} строк из {fileRows.length}. Проверьте что данные правильные.
            </p>
            <div className="overflow-x-auto rounded" style={{ border: "1px solid #e4e4e4" }}>
              <table className="text-xs w-full">
                <thead>
                  <tr style={{ background: "#fafafa", borderBottom: "1px solid #e4e4e4" }}>
                    {previewFields.map((f) => (
                      <th key={f.key} className="px-3 py-2 text-left font-semibold" style={{ color: "#888" }}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      {previewFields.map((f) => (
                        <td key={f.key} className="px-3 py-2 max-w-[160px] truncate" style={{ color: "#333" }}>
                          {String(row[f.key] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs mt-2" style={{ color: "#aaa" }}>
              {previewFields.length} полей для импорта · {fileRows.length} строк всего
            </p>
            <div className="flex justify-between mt-4">
              <Button size="sm" variant="secondary" onClick={() => setStep(2)}><ChevronLeft size={13} /> Маппинг</Button>
              <Button size="sm" onClick={handleImport} loading={loading}>
                {loading ? <><Loader size={13} className="animate-spin" /> Импортируем...</> : <>Импортировать {fileRows.length} строк <ChevronRight size={13} /></>}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Result */}
        {step === 4 && result && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: "#f0fff0", border: "1px solid #a5d6a7" }}>
              <CheckCircle size={24} style={{ color: "#2e7d32", flexShrink: 0 }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: "#2e7d32" }}>Импорт завершён</p>
                <p className="text-xs" style={{ color: "#555" }}>
                  Добавлено: <strong>{result.added}</strong>
                  {result.updated > 0 && <> · Обновлено: <strong>{result.updated}</strong></>}
                  {result.skipped > 0 && <> · Пропущено: <strong>{result.skipped}</strong></>}
                  {" "}· Всего: <strong>{result.total}</strong>
                </p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="p-3 rounded" style={{ background: "#fff3e0", border: "1px solid #ffcc80" }}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={14} style={{ color: "#e65c00" }} />
                  <span className="text-xs font-semibold" style={{ color: "#e65c00" }}>Ошибки ({result.errors.length})</span>
                </div>
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto" style={{ color: "#666" }}>
                  {result.errors.slice(0, 20).map((e, i) => <li key={i}>• {e}</li>)}
                  {result.errors.length > 20 && <li style={{ color: "#aaa" }}>... и ещё {result.errors.length - 20}</li>}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={reset}>Загрузить ещё</Button>
              <Button size="sm" onClick={handleClose}>Закрыть</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
