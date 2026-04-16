"use client";

import { useState, useRef } from "react";
import { Upload, Search, Filter, Plus, Check, X, Phone, ArrowUpDown, Star } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import * as XLSX from "xlsx";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  waiting: { label: "Ждёт прозвона", color: "#888", bg: "#f5f5f5" },
  lead: { label: "Лид", color: "#2e7d32", bg: "#e8f5e9" },
  ndz: { label: "НДЗ", color: "#e65c00", bg: "#fff3e0" },
  refused: { label: "Отказ", color: "#c62828", bg: "#ffebee" },
};

const COLUMNS: { key: string; label: string; width?: number; editable?: boolean }[] = [
  { key: "main_email", label: "email", width: 160, editable: true },
  { key: "inn", label: "ИНН", width: 110, editable: true },
  { key: "kpp", label: "КПП", width: 110, editable: true },
  { key: "ogrn", label: "ОГРН", width: 130, editable: true },
  { key: "city", label: "Город", width: 120, editable: true },
  { key: "region", label: "Регион", width: 120, editable: true },
  { key: "company_status", label: "Статус", width: 120, editable: true },
  { key: "additional_website_1", label: "Доп. сайт 1", width: 150, editable: true },
  { key: "additional_website_2", label: "Доп. сайт 2", width: 150, editable: true },
  { key: "additional_website_3", label: "Доп. сайт 3", width: 150, editable: true },
  { key: "additional_email_1", label: "Доп. почта 1", width: 150, editable: true },
  { key: "additional_email_2", label: "Доп. почта 2", width: 150, editable: true },
  { key: "additional_email_3", label: "Доп. почта 3", width: 150, editable: true },
  { key: "founders", label: "Учредители", width: 200, editable: true },
  { key: "company_type", label: "Тип компании", width: 130, editable: true },
  { key: "additional_phone_1", label: "Доп. телефон 1", width: 130, editable: true },
  { key: "additional_phone_2", label: "Доп. телефон 2", width: 130, editable: true },
  { key: "additional_phone_3", label: "Доп. телефон 3", width: 130, editable: true },
  { key: "company_name", label: "Наименование", width: 200, editable: true },
  { key: "main_website", label: "Основной сайт", width: 150, editable: true },
  { key: "director_name", label: "ФИО директора", width: 180, editable: true },
  { key: "main_okved", label: "Основной ОКВЭД", width: 120, editable: true },
  { key: "postal_code", label: "Почтовый индекс", width: 110, editable: true },
  { key: "registration_date", label: "Дата регистрации", width: 130, editable: true },
  { key: "director_inn", label: "ИНН руководителя", width: 130, editable: true },
  { key: "main_phone", label: "Основной телефон", width: 130, editable: true },
  { key: "director_gender", label: "Пол руководителя", width: 120, editable: true },
  { key: "years_since_registration", label: "Лет с регистрации", width: 120, editable: true },
  { key: "legal_address", label: "Юридический адрес", width: 200, editable: true },
  { key: "additional_okveds", label: "Дополнительные ОКВЭД", width: 170, editable: true },
  { key: "sro_nopriz", label: "Членство в СРО (НОПРИЗ)", width: 170, editable: true },
  { key: "revenue_2022", label: "Выручка, тыс. руб. (2022)", width: 150, editable: true },
  { key: "revenue_2023", label: "Выручка, тыс. руб. (2023)", width: 150, editable: true },
  { key: "revenue_2024", label: "Выручка, тыс. руб. (2024)", width: 150, editable: true },
  { key: "revenue_2025", label: "Выручка, тыс. руб. (2025)", width: 150, editable: true },
  { key: "director_position", label: "Должность руководителя", width: 170, editable: true },
  { key: "sro_nostroy", label: "Членство в СРО (НОСТРОЙ)", width: 170, editable: true },
  { key: "director_since", label: "Дата вступления в должность", width: 170, editable: true },
  { key: "profit_2022", label: "Чистая прибыль, тыс. руб. (2022)", width: 180, editable: true },
  { key: "profit_2023", label: "Чистая прибыль, тыс. руб. (2023)", width: 180, editable: true },
  { key: "profit_2024", label: "Чистая прибыль, тыс. руб. (2024)", width: 180, editable: true },
  { key: "profit_2025", label: "Чистая прибыль, тыс. руб. (2025)", width: 180, editable: true },
  { key: "call_reached", label: "Дозвон/нет", width: 90 },
  { key: "comment", label: "Комментарий", width: 200, editable: true },
];

const DB_FIELDS = [
  "company_name", "inn", "kpp", "ogrn", "city", "region", "company_status", "legal_address", "postal_code",
  "company_type", "registration_date", "main_okved", "additional_okveds",
  "director_name", "director_inn", "director_gender", "director_position", "director_since",
  "years_since_registration", "main_phone", "additional_phone_1", "additional_phone_2", "additional_phone_3",
  "main_email", "additional_email_1", "additional_email_2", "additional_email_3",
  "main_website", "additional_website_1", "additional_website_2", "additional_website_3",
  "founders", "sro_nopriz", "sro_nostroy",
  "revenue_2022", "revenue_2023", "revenue_2024", "revenue_2025",
  "profit_2022", "profit_2023", "profit_2024", "profit_2025",
  "discovered_phone", "discovered_email", "discovered_name", "discovered_position", "comment",
  "call_reached", "primary_phone", "primary_email",
];

const IMPORT_MAP: Record<string, string> = {
  "наименование": "company_name", "инн": "inn", "кпп": "kpp", "огрн": "ogrn",
  "город": "city", "регион": "region", "статус": "company_status",
  "email": "main_email", "основная почта": "main_email",
  "основной телефон": "main_phone", "основной сайт": "main_website",
  "фио директора": "director_name", "должность руководителя": "director_position",
  "инн руководителя": "director_inn", "пол руководителя": "director_gender",
  "дата вступления в должность": "director_since",
  "дата регистрации": "registration_date", "лет с регистрации": "years_since_registration",
  "юридический адрес": "legal_address", "почтовый индекс": "postal_code",
  "тип компании": "company_type", "основной оквэд": "main_okved",
  "дополнительные оквэд": "additional_okveds", "учредители": "founders",
  "членство в сро (ноприз)": "sro_nopriz", "членство в сро (нострой)": "sro_nostroy",
  "доп. телефон 1": "additional_phone_1", "доп. телефон 2": "additional_phone_2", "доп. телефон 3": "additional_phone_3",
  "доп. почта 1": "additional_email_1", "доп. почта 2": "additional_email_2", "доп. почта 3": "additional_email_3",
  "доп. сайт 1": "additional_website_1", "доп. сайт 2": "additional_website_2", "доп. сайт 3": "additional_website_3",
  "выручка, тыс. рублей (2022)": "revenue_2022", "выручка, тыс. рублей (2023)": "revenue_2023",
  "выручка, тыс. рублей (2024)": "revenue_2024", "выручка, тыс. рублей (2025)": "revenue_2025",
  "чистая прибыль (убыток), тыс. рублей (2022)": "profit_2022", "чистая прибыль (убыток), тыс. рублей (2023)": "profit_2023",
  "чистая прибыль (убыток), тыс. рублей (2024)": "profit_2024", "чистая прибыль (убыток), тыс. рублей (2025)": "profit_2025",
  "комментарий": "comment", "примечание": "comment", "примечания": "comment",
  "узнанный номер телефона": "discovered_phone", "узнанный эмайл": "discovered_email",
  "узнанное имя": "discovered_name", "узнанная должность": "discovered_position",
  "дозвон/нет": "call_reached",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ColdCallsClient({ initialRows, users }: { initialRows: any[]; users: { id: string; full_name: string }[] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>(initialRows);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("");
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [convertOpen, setConvertOpen] = useState<string | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => Object.fromEntries(COLUMNS.map((c) => [c.key, c.width ?? 120])));
  const [importing, setImporting] = useState(false);
  const [showCount, setShowCount] = useState(200);

  // Mapping state
  const [mappingOpen, setMappingOpen] = useState(false);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingRows, setPendingRows] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [greenPhones, setGreenPhones] = useState<Map<number, string>>(new Map());

  const fileRef = useRef<HTMLInputElement>(null);

  // Filter + sort
  let filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (regionFilter && !r.region?.toLowerCase().includes(regionFilter.toLowerCase())) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.company_name?.toLowerCase().includes(q)) || (r.inn?.includes(q)) || (r.main_phone?.includes(q)) || (r.director_name?.toLowerCase().includes(q)) || (r.city?.toLowerCase().includes(q));
  });

  // Sort: discovered_phone first, then by sortField
  filtered = [...filtered].sort((a, b) => {
    // Always: rows with discovered_phone first
    const aHasPhone = a.discovered_phone ? 1 : 0;
    const bHasPhone = b.discovered_phone ? 1 : 0;
    if (aHasPhone !== bHasPhone) return bHasPhone - aHasPhone;
    // Then by sort field
    if (sortField) {
      const aVal = Number(a[sortField]) || 0;
      const bVal = Number(b[sortField]) || 0;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    }
    return 0;
  });

  const visible = filtered.slice(0, showCount);
  const regions = [...new Set(rows.map((r) => r.region).filter(Boolean))].sort();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function updateField(id: string, field: string, value: any) {
    fetch("/api/cold-calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id, field, value }) }).catch(() => {});
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result;
      if (!buf) return;
      const wb = XLSX.read(buf, { type: "array", cellStyles: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsonRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!jsonRows.length) { alert("Файл пустой"); return; }

      const headers = Object.keys(jsonRows[0]);

      // Try to detect green cells (phone numbers) — check cell fill color
      const greens = new Map<number, string>();
      try {
        const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
        for (let row = range.s.r + 1; row <= range.e.r; row++) {
          for (let col = range.s.c; col <= range.e.c; col++) {
            const addr = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = ws[addr];
            if (!cell) continue;
            // Check if cell has green fill
            const fill = cell.s?.fill?.fgColor?.rgb || cell.s?.fill?.bgColor?.rgb || "";
            const isGreen = fill && (fill.toLowerCase().includes("00ff00") || fill.toLowerCase().includes("92d050") || fill.toLowerCase().includes("00b050") || fill.toLowerCase().includes("c6efce"));
            if (isGreen && cell.v) {
              const val = String(cell.v).trim();
              if (val && /[\d+\-()]{7,}/.test(val)) {
                greens.set(row - 1, val); // row-1 because header is row 0
              }
            }
          }
        }
      } catch { /* ignore style parsing errors */ }
      setGreenPhones(greens);

      // Auto-map headers
      const autoMapping: Record<string, string> = {};
      for (const h of headers) {
        const norm = h.toLowerCase().trim();
        if (IMPORT_MAP[norm]) autoMapping[h] = IMPORT_MAP[norm];
      }

      setFileHeaders(headers);
      setMapping(autoMapping);
      setPendingRows(jsonRows);
      setMappingOpen(true);
    };
    reader.readAsArrayBuffer(file);
  }

  async function doImport() {
    setMappingOpen(false);
    setImporting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toInsert: any[] = [];
      for (let i = 0; i < pendingRows.length; i++) {
        const raw = pendingRows[i];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped: any = { status: "waiting", created_by: user?.id };
        for (const [header, dbField] of Object.entries(mapping)) {
          if (dbField && raw[header] !== undefined && raw[header] !== "") {
            mapped[dbField] = String(raw[header]).trim();
          }
        }
        // Convert call_reached to boolean (from "Да"/"Нет"/etc.)
        if (mapped.call_reached !== undefined) {
          const v = String(mapped.call_reached).toLowerCase().trim();
          mapped.call_reached = ["да", "yes", "1", "true", "дозвон"].includes(v);
        }
        // Convert integer fields
        if (mapped.years_since_registration !== undefined) {
          const n = parseInt(mapped.years_since_registration);
          mapped.years_since_registration = isNaN(n) ? null : n;
        }
        // Convert numeric fields (revenue/profit) — strip spaces, replace comma with dot
        for (const nf of ["revenue_2022","revenue_2023","revenue_2024","revenue_2025","profit_2022","profit_2023","profit_2024","profit_2025"]) {
          if (mapped[nf] !== undefined) {
            const cleaned = String(mapped[nf]).replace(/\s/g, "").replace(",", ".");
            const num = parseFloat(cleaned);
            mapped[nf] = isNaN(num) ? null : num;
          }
        }
        // Green phone → discovered_phone
        if (greenPhones.has(i) && !mapped.discovered_phone) {
          mapped.discovered_phone = greenPhones.get(i);
        }
        if (!mapped.company_name && !mapped.inn && !mapped.main_phone) continue;
        toInsert.push(mapped);
      }

      if (!toInsert.length) { alert("Нет данных для импорта"); setImporting(false); return; }

      let totalImported = 0;
      const allErrors: string[] = [];
      const BATCH = 100;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);
        try {
          const res = await fetch("/api/cold-calls/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: batch }) });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            allErrors.push(`Batch ${Math.floor(i/BATCH)+1}: HTTP ${res.status} ${text.slice(0, 200)}`);
            continue;
          }
          const result = await res.json();
          totalImported += result.imported ?? 0;
          if (result.errors?.length) allErrors.push(...result.errors);
        } catch (e) { allErrors.push(`Batch ${Math.floor(i/BATCH)+1}: ${e}`); }
      }
      if (allErrors.length) alert(`Импортировано: ${totalImported} из ${toInsert.length}\nОшибки (${allErrors.length}):\n${allErrors.join("\n")}`);
      else alert(`Импортировано: ${totalImported} из ${toInsert.length}`);
      window.location.reload();
    } catch (e) { alert("Ошибка: " + String(e)); }
    setImporting(false);
  }

  function toggleSort(field: string) {
    if (sortField === field) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortField(field); setSortDir("desc"); }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convertRow = rows.find((r) => r.id === convertOpen) as any;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        <div className="flex gap-1">
          {["all", ...Object.keys(STATUS_CONFIG)].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="text-xs px-2.5 py-1 rounded-full"
              style={{
                background: statusFilter === s ? (s === "all" ? "#0067a5" : STATUS_CONFIG[s]?.bg) : "#f5f5f5",
                color: statusFilter === s ? (s === "all" ? "#fff" : STATUS_CONFIG[s]?.color) : "#888",
                border: `1px solid ${statusFilter === s ? (s === "all" ? "#0067a5" : STATUS_CONFIG[s]?.color + "40") : "#e0e0e0"}`,
              }}>
              {s === "all" ? `Все (${rows.length})` : `${STATUS_CONFIG[s].label} (${rows.filter((r) => r.status === s).length})`}
            </button>
          ))}
        </div>
        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
          className="text-xs px-2 py-1 rounded" style={{ border: "1px solid #d0d0d0", maxWidth: 150 }}>
          <option value="">Все регионы</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={() => toggleSort("revenue_2024")} className="text-xs px-2 py-1 rounded flex items-center gap-1"
          style={{ border: "1px solid #d0d0d0", color: sortField === "revenue_2024" ? "#0067a5" : "#888" }}>
          <ArrowUpDown size={12} /> Выручка {sortField === "revenue_2024" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </button>
        <Button size="sm" variant="secondary" onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = ".xlsx,.xls,.csv"; input.onchange = () => { if (input.files?.[0]) handleFile(input.files[0]); }; input.click(); }} disabled={importing}>
          <Upload size={13} /> {importing ? "Импорт..." : "Импорт XLSX"}
        </Button>
        {rows.length > 0 && (
          <button onClick={async () => {
            if (!confirm(`Удалить ВСЕ ${rows.length} записей?`)) return;
            await fetch("/api/cold-calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_all" }) });
            setRows([]);
          }} className="text-xs px-2 py-1 rounded hover:bg-red-50" style={{ color: "#c62828", border: "1px solid #c62828" }}>
            <X size={12} className="inline mr-1" />Удалить все
          </button>
        )}
        <span className="text-xs" style={{ color: "#aaa" }}>{filtered.length} записей</span>
      </div>

      {/* Table */}
      <div className="bg-white overflow-auto" style={{ border: "1px solid #e4e4e4", borderRadius: 6, maxHeight: "calc(100vh - 180px)" }}>
        <table className="text-xs" style={{ tableLayout: "fixed", width: 40 + Object.values(colWidths).reduce((a, b) => a + b, 0) + 40 }}>
          <thead className="sticky top-0 z-10">
            <tr style={{ background: "#fafafa", borderBottom: "2px solid #e4e4e4" }}>
              <th className="px-2 py-2 text-left font-semibold sticky left-0 bg-gray-50 z-20" style={{ width: 40, color: "#888" }}>✓</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-2 py-2 text-left font-semibold whitespace-nowrap hover:bg-gray-100 relative select-none"
                  style={{ width: colWidths[col.key], minWidth: 40, color: "#888" }}
                  onClick={() => col.key.includes("revenue") || col.key.includes("profit") ? toggleSort(col.key) : null}>
                  {col.label}
                  {sortField === col.key && <span className="ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>}
                  <div
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400 active:bg-blue-500"
                    style={{ zIndex: 30 }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const startX = e.clientX;
                      const startW = colWidths[col.key];
                      const onMove = (ev: MouseEvent) => {
                        const w = Math.max(40, startW + ev.clientX - startX);
                        setColWidths((prev) => ({ ...prev, [col.key]: w }));
                      };
                      const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
                      document.addEventListener("mousemove", onMove);
                      document.addEventListener("mouseup", onUp);
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #f0f0f0", background: row.discovered_phone ? "#f0fff4" : "transparent" }} className="hover:bg-gray-50">
                <td className="px-2 py-1.5 sticky left-0 bg-white z-10">
                  {row.status !== "lead" ? (
                    <button onClick={() => setConvertOpen(row.id)} className="w-5 h-5 rounded border flex items-center justify-center hover:bg-green-50" style={{ borderColor: "#d0d0d0" }}>
                      <Check size={12} style={{ color: "#ccc" }} />
                    </button>
                  ) : (
                    <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: "#e8f5e9" }}>
                      <Check size={12} style={{ color: "#2e7d32" }} />
                    </span>
                  )}
                </td>
                {COLUMNS.map((col) => {
                  const isPhoneCol = ["main_phone", "additional_phone_1", "additional_phone_2", "additional_phone_3"].includes(col.key);
                  const isEmailCol = ["main_email", "additional_email_1", "additional_email_2", "additional_email_3"].includes(col.key);
                  const isPrimary = (isPhoneCol && row.primary_phone === row[col.key] && row[col.key]) ||
                    (isEmailCol && row.primary_email === row[col.key] && row[col.key]);
                  return (
                  <td key={col.key} className="px-2 py-1.5">
                    {col.key === "status" ? (
                      <select value={row.status} onChange={(e) => updateField(row.id, "status", e.target.value)}
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: STATUS_CONFIG[row.status]?.bg, color: STATUS_CONFIG[row.status]?.color, border: "1px solid #e0e0e0" }}>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    ) : col.key === "call_reached" ? (
                      <input type="checkbox" checked={row.call_reached ?? false} onChange={(e) => updateField(row.id, "call_reached", e.target.checked)} style={{ accentColor: "#0067a5" }} />
                    ) : (isPhoneCol || isEmailCol) && col.editable ? (
                      <div className="flex items-center gap-0.5">
                        <input value={row[col.key] ?? ""} onChange={(e) => updateField(row.id, col.key, e.target.value)}
                          className="flex-1 text-xs px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                          style={{ border: "1px solid transparent", background: isPrimary ? "#e3f2fd" : "transparent" }}
                          onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#d0d0d0"; }}
                          onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "transparent"; }} />
                        {isPhoneCol && row[col.key] && (
                          <button title="Позвонить" onClick={async () => {
                            const res = await fetch("/api/novofon/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: row[col.key] }) });
                            const data = await res.json();
                            if (data.error) alert("Ошибка: " + data.error);
                          }} className="shrink-0 p-0.5 rounded hover:bg-green-50">
                            <Phone size={11} style={{ color: "#2e7d32" }} />
                          </button>
                        )}
                        {row[col.key] && (
                          <button title="Сделать основным для конвертации" onClick={() => {
                            const field = isPhoneCol ? "primary_phone" : "primary_email";
                            const val = row[col.key];
                            updateField(row.id, field, isPrimary ? null : val);
                          }} className="shrink-0 p-0.5 rounded hover:bg-yellow-50">
                            <Star size={11} fill={isPrimary ? "#f59e0b" : "none"} style={{ color: isPrimary ? "#f59e0b" : "#ccc" }} />
                          </button>
                        )}
                      </div>
                    ) : col.editable ? (
                      <input value={row[col.key] ?? ""} onChange={(e) => updateField(row.id, col.key, e.target.value)}
                        className="w-full text-xs px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                        style={{ border: "1px solid transparent", background: "transparent" }}
                        onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#d0d0d0"; }}
                        onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "transparent"; }} />
                    ) : (
                      <span className="text-xs" style={{ color: "#555" }}>{row[col.key] ?? ""}</span>
                    )}
                  </td>
                  );
                })}
                <td className="px-1 py-1">
                  <button onClick={() => { fetch("/api/cold-calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: row.id }) }); setRows((prev) => prev.filter((r) => r.id !== row.id)); }}
                    className="p-1 rounded hover:bg-red-50" title="Удалить"><X size={12} style={{ color: "#c62828" }} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="text-center py-12">
            <Phone size={32} className="mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Нет записей. Импортируйте XLSX файл.</p>
          </div>
        )}
      </div>
      {showCount < filtered.length && (
        <div className="flex justify-center mt-3">
          <button onClick={() => setShowCount((c) => c + 200)} className="text-sm px-4 py-1.5 rounded" style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}>
            Показать ещё {Math.min(200, filtered.length - showCount)}
          </button>
        </div>
      )}

      {/* Mapping Modal */}
      <Modal open={mappingOpen} onClose={() => setMappingOpen(false)} title={`Маппинг столбцов (${pendingRows.length} строк)`} size="lg">
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <p className="text-xs" style={{ color: "#888" }}>Свяжите столбцы из файла с полями CRM. Незамапленные столбцы будут пропущены.</p>
          {fileHeaders.map((header) => (
            <div key={header} className="flex items-center gap-3">
              <span className="text-xs font-medium w-60 truncate" style={{ color: "#333" }}>{header}</span>
              <span className="text-xs" style={{ color: "#aaa" }}>→</span>
              <select value={mapping[header] || ""} onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value }))}
                className="text-xs px-2 py-1 rounded flex-1" style={{ border: "1px solid #d0d0d0" }}>
                <option value="">— Пропустить —</option>
                {DB_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          ))}
          {greenPhones.size > 0 && (
            <p className="text-xs p-2 rounded" style={{ background: "#e8f5e9", color: "#2e7d32" }}>
              🟢 Обнаружено {greenPhones.size} зелёных ячеек с телефонами → будут записаны в "Узн. телефон"
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setMappingOpen(false)}>Отмена</Button>
            <Button size="sm" onClick={doImport} loading={importing}>
              <Upload size={13} /> Импортировать {pendingRows.length} строк
            </Button>
          </div>
        </div>
      </Modal>

      {/* Convert Modal */}
      <Modal open={!!convertOpen} onClose={() => setConvertOpen(null)} title="Конвертировать в лид" size="lg">
        {convertRow && <ConvertForm row={convertRow} users={users} onDone={(ids) => {
          updateField(convertRow.id, "status", "lead");
          if (ids.lead) updateField(convertRow.id, "converted_lead_id", ids.lead);
          if (ids.contact) updateField(convertRow.id, "converted_contact_id", ids.contact);
          if (ids.company) updateField(convertRow.id, "converted_company_id", ids.company);
          setConvertOpen(null);
        }} onCancel={() => setConvertOpen(null)} />}
      </Modal>
    </div>
  );
}

function cleanPhone(p: string): string {
  if (!p) return "";
  return p.replace(/[\s()\-]/g, "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ConvertForm({ row, users, onDone, onCancel }: { row: any; users: { id: string; full_name: string }[]; onDone: (ids: { lead?: string; contact?: string; company?: string }) => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);

  // Collect all phones and emails
  const allPhones = [row.primary_phone || row.main_phone, row.additional_phone_1, row.additional_phone_2, row.additional_phone_3]
    .filter(Boolean).map(cleanPhone).filter((v, i, a) => a.indexOf(v) === i);
  const allEmails = [row.primary_email || row.main_email, row.additional_email_1, row.additional_email_2, row.additional_email_3]
    .filter(Boolean).map((e: string) => e.trim()).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);

  const [companyName, setCompanyName] = useState(row.company_name || "");
  const [companyInn, setCompanyInn] = useState(row.inn || "");
  const [companyPhone, setCompanyPhone] = useState(allPhones[0] || "");
  const [companyEmail, setCompanyEmail] = useState(allEmails[0] || "");
  const [companyAddress, setCompanyAddress] = useState(row.legal_address || "");
  const [companyCity, setCompanyCity] = useState(row.city || "");
  const [contactName, setContactName] = useState(row.discovered_name || row.director_name || "");
  const [contactPhone, setContactPhone] = useState(allPhones[0] || "");
  const [contactEmail, setContactEmail] = useState(allEmails[0] || "");
  const [contactPosition, setContactPosition] = useState(row.discovered_position || row.director_position || "");
  const [leadTitle, setLeadTitle] = useState(companyName ? `Прозвон: ${companyName}` : "Прозвон");
  const [leadComment, setLeadComment] = useState(row.comment || "");
  const [assignedTo, setAssignedTo] = useState("");

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const ids: { lead?: string; contact?: string; company?: string } = {};
    if (companyName) {
      const { data } = await supabase.from("companies").insert({
        name: companyName, inn: companyInn || null,
        phone: cleanPhone(companyPhone) || null, email: companyEmail || null,
        additional_phone_1: allPhones[1] || null, additional_phone_2: allPhones[2] || null, additional_phone_3: allPhones[3] || null,
        additional_email_1: allEmails[1] || null, additional_email_2: allEmails[2] || null, additional_email_3: allEmails[3] || null,
        legal_address: companyAddress || null, city: companyCity || null,
        website: row.main_website || null,
        description: leadComment || null,
        assigned_to: assignedTo || user?.id, created_by: user?.id,
      }).select("id").single();
      if (data) ids.company = data.id;
    }
    if (contactName) {
      const { data } = await supabase.from("contacts").insert({
        full_name: contactName, phone: cleanPhone(contactPhone) || null, email: contactEmail || null,
        position: contactPosition || null,
        additional_phone_1: allPhones[1] || null, additional_phone_2: allPhones[2] || null, additional_phone_3: allPhones[3] || null,
        additional_email_1: allEmails[1] || null, additional_email_2: allEmails[2] || null, additional_email_3: allEmails[3] || null,
        company_id: ids.company || null, assigned_to: assignedTo || user?.id, created_by: user?.id,
      }).select("id").single();
      if (data) ids.contact = data.id;
    }
    const { data: lead } = await supabase.from("leads").insert({
      title: leadTitle, source: "cold_call", description: leadComment || null,
      contact_id: ids.contact || null, company_id: ids.company || null,
      assigned_to: assignedTo || user?.id, created_by: user?.id,
    }).select("id").single();
    if (lead) ids.lead = lead.id;
    setSaving(false);
    onDone(ids);
  }

  return (
    <div className="p-5 space-y-4">
      <div className="p-3 rounded space-y-2" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
        <h4 className="text-xs font-semibold" style={{ color: "#0067a5" }}>Компания</h4>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Название" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <Input label="ИНН" value={companyInn} onChange={(e) => setCompanyInn(e.target.value)} />
          <Input label="Телефон" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} />
          <Input label="Email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} />
          <Input label="Город" value={companyCity} onChange={(e) => setCompanyCity(e.target.value)} />
          <Input label="Юр. адрес" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
        </div>
        {(allPhones.length > 1 || allEmails.length > 1) && (
          <div className="text-xs mt-1" style={{ color: "#888" }}>
            {allPhones.length > 1 && <span>Доп. тел: {allPhones.slice(1).join(", ")}</span>}
            {allPhones.length > 1 && allEmails.length > 1 && <span> · </span>}
            {allEmails.length > 1 && <span>Доп. почта: {allEmails.slice(1).join(", ")}</span>}
          </div>
        )}
      </div>
      <div className="p-3 rounded space-y-2" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
        <h4 className="text-xs font-semibold" style={{ color: "#0067a5" }}>Контакт</h4>
        <div className="grid grid-cols-2 gap-2">
          <Input label="ФИО" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <Input label="Телефон" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          <Input label="Email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          <Input label="Должность" value={contactPosition} onChange={(e) => setContactPosition(e.target.value)} />
        </div>
      </div>
      <div className="p-3 rounded space-y-2" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
        <h4 className="text-xs font-semibold" style={{ color: "#0067a5" }}>Лид</h4>
        <Input label="Название" value={leadTitle} onChange={(e) => setLeadTitle(e.target.value)} />
        <textarea value={leadComment} onChange={(e) => setLeadComment(e.target.value)} placeholder="Комментарий"
          className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 resize-none" rows={2} />
        <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2">
          <option value="">Текущий пользователь</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>Отмена</Button>
        <Button size="sm" onClick={handleSave} loading={saving}><Plus size={13} /> Создать</Button>
      </div>
    </div>
  );
}
