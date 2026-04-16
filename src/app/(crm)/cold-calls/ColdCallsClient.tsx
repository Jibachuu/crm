"use client";

import { useState, useRef } from "react";
import { Upload, Download, Search, Filter, Plus, Check, X, Phone } from "lucide-react";
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

// Column definitions for the table
const COLUMNS: { key: string; label: string; width?: number; editable?: boolean }[] = [
  { key: "status", label: "Статус", width: 120 },
  { key: "company_name", label: "Наименование", width: 200, editable: true },
  { key: "inn", label: "ИНН", width: 110, editable: true },
  { key: "main_phone", label: "Осн. телефон", width: 130, editable: true },
  { key: "main_email", label: "Осн. почта", width: 160, editable: true },
  { key: "city", label: "Город", width: 120, editable: true },
  { key: "region", label: "Регион", width: 120, editable: true },
  { key: "director_name", label: "ФИО директора", width: 180, editable: true },
  { key: "director_position", label: "Должность рук.", width: 140, editable: true },
  { key: "main_website", label: "Осн. сайт", width: 150, editable: true },
  { key: "kpp", label: "КПП", width: 100, editable: true },
  { key: "ogrn", label: "ОГРН", width: 120, editable: true },
  { key: "company_type", label: "Тип компании", width: 120, editable: true },
  { key: "legal_address", label: "Юр. адрес", width: 200, editable: true },
  { key: "main_okved", label: "Осн. ОКВЭД", width: 120, editable: true },
  { key: "revenue_2024", label: "Выручка 2024", width: 120, editable: true },
  { key: "revenue_2025", label: "Выручка 2025", width: 120, editable: true },
  { key: "call_reached", label: "Дозвон", width: 70 },
  { key: "discovered_name", label: "Узнанное имя", width: 150, editable: true },
  { key: "discovered_phone", label: "Узн. телефон", width: 130, editable: true },
  { key: "discovered_email", label: "Узн. email", width: 150, editable: true },
  { key: "discovered_position", label: "Узн. должность", width: 140, editable: true },
  { key: "comment", label: "Комментарий", width: 200, editable: true },
];

// Map spreadsheet column names → DB field names
const IMPORT_MAP: Record<string, string> = {
  "наименование": "company_name", "инн": "inn", "кпп": "kpp", "огрн": "ogrn",
  "город": "city", "регион": "region", "статус": "status",
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
  "комментарий": "comment",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ColdCallsClient({ initialRows, users }: { initialRows: any[]; users: { id: string; full_name: string }[] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>(initialRows);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [convertOpen, setConvertOpen] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.company_name?.toLowerCase().includes(q)) ||
      (r.inn?.includes(q)) ||
      (r.main_phone?.includes(q)) ||
      (r.director_name?.toLowerCase().includes(q)) ||
      (r.city?.toLowerCase().includes(q));
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function updateField(id: string, field: string, value: any) {
    const supabase = createClient();
    await supabase.from("cold_calls").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", id);
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
  }

  async function importXlsx(file: File) {
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsonRows: any[] = XLSX.utils.sheet_to_json(ws);

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Map all rows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toInsert: any[] = [];
      let unmapped = 0;
      for (const raw of jsonRows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped: any = { status: "waiting", created_by: user?.id };
        for (const [key, val] of Object.entries(raw)) {
          const dbField = IMPORT_MAP[key.toLowerCase().trim()];
          if (dbField) mapped[dbField] = String(val).trim();
          else unmapped++;
        }
        if (!mapped.company_name && !mapped.inn && !mapped.main_phone) continue;
        toInsert.push(mapped);
      }

      if (toInsert.length === 0) {
        alert(`Не удалось замаппить столбцы.\nСтолбцы в файле: ${Object.keys(jsonRows[0] || {}).join(", ")}\n\nУбедитесь что названия столбцов на русском.`);
        setImporting(false);
        return;
      }

      // Batch insert (100 per batch)
      let imported = 0;
      for (let i = 0; i < toInsert.length; i += 100) {
        const batch = toInsert.slice(i, i + 100);
        const { data, error } = await supabase.from("cold_calls").insert(batch).select("*");
        if (data) {
          setRows((prev) => [...prev, ...data]);
          imported += data.length;
        }
        if (error) { alert(`Ошибка батча ${Math.floor(i/100)+1}: ${error.message}`); break; }
      }
      alert(`Импортировано: ${imported} из ${toInsert.length} записей${unmapped > 0 ? `\n(${unmapped} полей не замаппились)` : ""}`);
    } catch (e) { alert("Ошибка импорта: " + String(e)); }
    setImporting(false);
  }

  // Convert to lead+contact+company
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
        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={importing}>
          <Upload size={13} /> {importing ? "Импорт..." : "Импорт XLSX"}
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]; if (f) importXlsx(f); e.target.value = "";
        }} />
      </div>

      {/* Table */}
      <div className="bg-white overflow-auto" style={{ border: "1px solid #e4e4e4", borderRadius: 6, maxHeight: "calc(100vh - 180px)" }}>
        <table className="text-xs" style={{ minWidth: 2800 }}>
          <thead className="sticky top-0 z-10">
            <tr style={{ background: "#fafafa", borderBottom: "2px solid #e4e4e4" }}>
              <th className="px-2 py-2 text-left font-semibold sticky left-0 bg-gray-50 z-20" style={{ width: 40, color: "#888" }}>✓</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-2 py-2 text-left font-semibold whitespace-nowrap" style={{ width: col.width, color: "#888" }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #f0f0f0" }} className="hover:bg-gray-50">
                {/* Tick → convert */}
                <td className="px-2 py-1.5 sticky left-0 bg-white z-10">
                  {row.status !== "lead" ? (
                    <button onClick={() => { setConvertOpen(row.id); }}
                      className="w-5 h-5 rounded border flex items-center justify-center hover:bg-green-50"
                      style={{ borderColor: "#d0d0d0" }} title="Конвертировать в лид">
                      <Check size={12} style={{ color: "#ccc" }} />
                    </button>
                  ) : (
                    <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: "#e8f5e9" }}>
                      <Check size={12} style={{ color: "#2e7d32" }} />
                    </span>
                  )}
                </td>
                {COLUMNS.map((col) => (
                  <td key={col.key} className="px-2 py-1.5">
                    {col.key === "status" ? (
                      <select value={row.status} onChange={(e) => updateField(row.id, "status", e.target.value)}
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: STATUS_CONFIG[row.status]?.bg, color: STATUS_CONFIG[row.status]?.color, border: "1px solid #e0e0e0" }}>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    ) : col.key === "call_reached" ? (
                      <input type="checkbox" checked={row.call_reached ?? false}
                        onChange={(e) => updateField(row.id, "call_reached", e.target.checked)}
                        style={{ accentColor: "#0067a5" }} />
                    ) : col.editable ? (
                      <input value={row[col.key] ?? ""} onChange={(e) => updateField(row.id, col.key, e.target.value)}
                        className="w-full text-xs px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                        style={{ border: "1px solid transparent" }}
                        onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#d0d0d0"; }}
                        onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "transparent"; }} />
                    ) : (
                      <span className="text-xs" style={{ color: "#555" }}>{row[col.key] ?? ""}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Phone size={32} className="mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Нет записей. Импортируйте XLSX файл.</p>
          </div>
        )}
      </div>

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ConvertForm({ row, users, onDone, onCancel }: { row: any; users: { id: string; full_name: string }[]; onDone: (ids: { lead?: string; contact?: string; company?: string }) => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [companyName, setCompanyName] = useState(row.company_name || "");
  const [companyInn, setCompanyInn] = useState(row.inn || "");
  const [companyPhone, setCompanyPhone] = useState(row.main_phone || "");
  const [companyEmail, setCompanyEmail] = useState(row.main_email || "");
  const [companyAddress, setCompanyAddress] = useState(row.legal_address || "");
  const [contactName, setContactName] = useState(row.discovered_name || row.director_name || "");
  const [contactPhone, setContactPhone] = useState(row.discovered_phone || row.main_phone || "");
  const [contactEmail, setContactEmail] = useState(row.discovered_email || row.main_email || "");
  const [contactPosition, setContactPosition] = useState(row.discovered_position || row.director_position || "");
  const [leadTitle, setLeadTitle] = useState(companyName ? `Прозвон: ${companyName}` : "Прозвон");
  const [assignedTo, setAssignedTo] = useState("");

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const ids: { lead?: string; contact?: string; company?: string } = {};

    // 1. Create company
    if (companyName) {
      const { data } = await supabase.from("companies").insert({
        name: companyName, inn: companyInn || null, phone: companyPhone || null,
        email: companyEmail || null, legal_address: companyAddress || null,
        assigned_to: assignedTo || user?.id, created_by: user?.id,
      }).select("id").single();
      if (data) ids.company = data.id;
    }

    // 2. Create contact
    if (contactName) {
      const { data } = await supabase.from("contacts").insert({
        full_name: contactName, phone: contactPhone || null,
        email: contactEmail || null, position: contactPosition || null,
        company_id: ids.company || null,
        assigned_to: assignedTo || user?.id, created_by: user?.id,
      }).select("id").single();
      if (data) ids.contact = data.id;
    }

    // 3. Create lead
    const { data: lead } = await supabase.from("leads").insert({
      title: leadTitle, source: "cold_call",
      contact_id: ids.contact || null, company_id: ids.company || null,
      assigned_to: assignedTo || user?.id, created_by: user?.id,
    }).select("id").single();
    if (lead) ids.lead = lead.id;

    setSaving(false);
    onDone(ids);
  }

  return (
    <div className="p-5 space-y-4">
      <p className="text-xs" style={{ color: "#888" }}>Данные предзаполнены из строки прозвона. Проверьте и нажмите «Создать».</p>

      <div className="p-3 rounded space-y-2" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
        <h4 className="text-xs font-semibold" style={{ color: "#0067a5" }}>Компания</h4>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Название" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <Input label="ИНН" value={companyInn} onChange={(e) => setCompanyInn(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Input label="Телефон" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} />
          <Input label="Email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} />
          <Input label="Адрес" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
        </div>
      </div>

      <div className="p-3 rounded space-y-2" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
        <h4 className="text-xs font-semibold" style={{ color: "#0067a5" }}>Контакт</h4>
        <div className="grid grid-cols-2 gap-2">
          <Input label="ФИО" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <Input label="Должность" value={contactPosition} onChange={(e) => setContactPosition(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Телефон" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          <Input label="Email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
      </div>

      <div className="p-3 rounded space-y-2" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
        <h4 className="text-xs font-semibold" style={{ color: "#0067a5" }}>Лид</h4>
        <Input label="Название лида" value={leadTitle} onChange={(e) => setLeadTitle(e.target.value)} />
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Ответственный</label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Текущий пользователь</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>Отмена</Button>
        <Button size="sm" onClick={handleSave} loading={saving}>
          <Plus size={13} /> Создать лид + контакт + компанию
        </Button>
      </div>
    </div>
  );
}
