"use client";

import { useState } from "react";
import { Plus, Send, Mail, CheckCircle, XCircle, Clock, Eye, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { Card, CardBody } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/utils";
import * as XLSX from "xlsx";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  body_template: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string | null;
}

interface Contact {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  companies: { name: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик", sending: "Отправляется", sent: "Отправлена", failed: "Ошибка",
};
const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = {
  draft: "default", sending: "warning", sent: "success", failed: "danger",
};

const VARIABLES_HELP = [
  { var: "{имя}", desc: "ФИО контакта" },
  { var: "{email}", desc: "Email контакта" },
  { var: "{телефон}", desc: "Телефон" },
  { var: "{компания}", desc: "Название компании" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CampaignsClient({ initialCampaigns, contacts }: { initialCampaigns: Campaign[]; contacts: any[] }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [createOpen, setCreateOpen] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);

  async function sendCampaign(id: string) {
    if (!confirm("Начать рассылку? Письма будут отправлены всем получателям.")) return;
    setSending(id);
    const res = await fetch("/api/email/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", campaign_id: id }),
    });
    const data = await res.json();
    if (res.ok) {
      setCampaigns((prev) => prev.map((c) =>
        c.id === id ? { ...c, status: "sent", sent_count: data.sent, failed_count: data.failed, sent_at: new Date().toISOString() } : c
      ));
    } else {
      alert(data.error);
    }
    setSending(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={13} /> Новая рассылка
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-16">
          <Mail size={40} className="mx-auto mb-3" style={{ color: "#ddd" }} />
          <p className="text-sm" style={{ color: "#aaa" }}>Рассылки не созданы</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Card key={c.id}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold" style={{ color: "#333" }}>{c.name}</h3>
                      <Badge variant={STATUS_VARIANTS[c.status] ?? "default"}>{STATUS_LABELS[c.status] ?? c.status}</Badge>
                    </div>
                    <p className="text-xs" style={{ color: "#888" }}>Тема: {c.subject}</p>
                    <div className="flex gap-4 mt-2 text-xs" style={{ color: "#666" }}>
                      <span className="flex items-center gap-1"><Mail size={11} /> {c.total_recipients} получателей</span>
                      {c.sent_count > 0 && <span className="flex items-center gap-1"><CheckCircle size={11} style={{ color: "#2e7d32" }} /> {c.sent_count} отправлено</span>}
                      {c.failed_count > 0 && <span className="flex items-center gap-1"><XCircle size={11} style={{ color: "#c62828" }} /> {c.failed_count} ошибок</span>}
                      <span className="flex items-center gap-1"><Clock size={11} /> {formatDateTime(c.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPreviewCampaign(c)} className="p-2 rounded hover:bg-gray-100" title="Просмотр">
                      <Eye size={14} style={{ color: "#888" }} />
                    </button>
                    {c.status === "draft" && (
                      <Button size="sm" onClick={() => sendCampaign(c.id)} loading={sending === c.id}>
                        <Send size={13} /> Отправить
                      </Button>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <CreateCampaignModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        contacts={contacts}
        onCreated={(c) => { setCampaigns((prev) => [c, ...prev]); setCreateOpen(false); }}
      />

      {previewCampaign && (
        <Modal open onClose={() => setPreviewCampaign(null)} title={previewCampaign.name} size="lg">
          <div className="p-5">
            <p className="text-xs mb-1" style={{ color: "#888" }}>Тема:</p>
            <p className="text-sm mb-3 font-medium">{previewCampaign.subject}</p>
            <p className="text-xs mb-1" style={{ color: "#888" }}>Текст письма:</p>
            <div className="p-4 rounded text-sm whitespace-pre-wrap" style={{ background: "#f5f5f5", border: "1px solid #e0e0e0" }}>
              {previewCampaign.body_template}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Create Campaign Modal ───────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CreateCampaignModal({ open, onClose, contacts, onCreated }: { open: boolean; onClose: () => void; contacts: any[]; onCreated: (c: Campaign) => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [importedRecipients, setImportedRecipients] = useState<{ email: string; variables: Record<string, string> }[]>([]);
  const [source, setSource] = useState<"contacts" | "file">("contacts");
  const [loading, setLoading] = useState(false);
  const [searchContacts, setSearchContacts] = useState("");

  function reset() {
    setStep(1); setName(""); setSubject(""); setBodyTemplate("");
    setSelectedContacts(new Set()); setImportedRecipients([]); setSource("contacts");
  }

  function handleClose() { reset(); onClose(); }

  const filteredContacts = contacts.filter((c: Contact) =>
    !searchContacts ||
    c.full_name?.toLowerCase().includes(searchContacts.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchContacts.toLowerCase())
  );

  function toggleContact(id: string) {
    setSelectedContacts((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function selectAllContacts() {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map((c: Contact) => c.id)));
    }
  }

  async function handleFileUpload(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    const recipients = rows
      .filter((r) => r.email || r.Email || r.EMAIL)
      .map((r) => ({
        email: String(r.email || r.Email || r.EMAIL || "").trim(),
        variables: {
          имя: String(r["имя"] || r["Имя"] || r["ФИО"] || r["фио"] || r["full_name"] || r["name"] || "").trim(),
          компания: String(r["компания"] || r["Компания"] || r["company"] || "").trim(),
          телефон: String(r["телефон"] || r["Телефон"] || r["phone"] || "").trim(),
          email: String(r.email || r.Email || r.EMAIL || "").trim(),
        },
      }))
      .filter((r) => r.email.includes("@"));

    setImportedRecipients(recipients);
  }

  function getRecipients(): { email: string; variables: Record<string, string> }[] {
    if (source === "file") return importedRecipients;
    return contacts
      .filter((c: Contact) => selectedContacts.has(c.id) && c.email)
      .map((c: Contact) => ({
        email: c.email!,
        variables: {
          имя: c.full_name ?? "",
          email: c.email ?? "",
          телефон: c.phone ?? "",
          компания: (c.companies as { name: string } | null)?.name ?? "",
        },
      }));
  }

  async function handleCreate() {
    setLoading(true);
    const recipients = getRecipients();
    const res = await fetch("/api/email/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name, subject, body_template: bodyTemplate, recipients }),
    });
    const data = await res.json();
    if (res.ok) {
      onCreated(data.campaign);
      reset();
    } else {
      alert(data.error);
    }
    setLoading(false);
  }

  const recipients = getRecipients();
  const s = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 };

  return (
    <Modal open={open} onClose={handleClose} title="Новая рассылка" size="lg">
      <div className="p-5">
        {/* Steps */}
        <div className="flex items-center gap-2 mb-5">
          {["Письмо", "Получатели", "Отправка"].map((label, idx) => {
            const n = idx + 1;
            return (
              <div key={n} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: step > n ? "#2e7d32" : step === n ? "#0067a5" : "#e0e0e0", color: step >= n ? "#fff" : "#888" }}>
                    {step > n ? "✓" : n}
                  </div>
                  <span className="text-xs font-medium" style={{ color: step === n ? "#0067a5" : "#aaa" }}>{label}</span>
                </div>
                {idx < 2 && <div className="h-px flex-1" style={{ background: step > n ? "#2e7d32" : "#e0e0e0", minWidth: 24 }} />}
              </div>
            );
          })}
        </div>

        {/* Step 1: Compose */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label style={lbl}>Название рассылки</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={s} placeholder="Новогодняя акция" />
            </div>
            <div>
              <label style={lbl}>Тема письма</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} style={s} placeholder="Специальное предложение для {имя}" />
            </div>
            <div>
              <label style={lbl}>Текст письма</label>
              <textarea
                value={bodyTemplate}
                onChange={(e) => setBodyTemplate(e.target.value)}
                rows={8}
                style={{ ...s, resize: "vertical" }}
                placeholder={"Здравствуйте, {имя}!\n\nМы подготовили для компании {компания} специальное предложение...\n\nС уважением,\nВаша команда"}
              />
            </div>
            <div className="p-3 rounded" style={{ background: "#f5f5f5", border: "1px solid #e0e0e0" }}>
              <p className="text-xs font-semibold mb-2" style={{ color: "#555" }}>Доступные переменные:</p>
              <div className="flex gap-3">
                {VARIABLES_HELP.map((v) => (
                  <span key={v.var} className="text-xs px-2 py-1 rounded cursor-pointer hover:bg-blue-50"
                    style={{ background: "#fff", border: "1px solid #ddd", color: "#0067a5" }}
                    onClick={() => setBodyTemplate((p) => p + v.var)}
                    title={v.desc}
                  >
                    {v.var}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setStep(2)} disabled={!name || !subject || !bodyTemplate}>Далее →</Button>
            </div>
          </div>
        )}

        {/* Step 2: Recipients */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Source toggle */}
            <div className="flex gap-3">
              {([
                { value: "contacts", label: "Из контактов CRM", desc: `${contacts.length} с email` },
                { value: "file", label: "Из файла Excel", desc: "Загрузить список" },
              ] as const).map((opt) => (
                <label key={opt.value} className="flex items-start gap-2 cursor-pointer flex-1 p-3 rounded"
                  style={{ border: `1px solid ${source === opt.value ? "#0067a5" : "#ddd"}`, background: source === opt.value ? "#e8f4fd" : "#fff" }}>
                  <input type="radio" value={opt.value} checked={source === opt.value} onChange={() => setSource(opt.value)}
                    style={{ marginTop: 2, accentColor: "#0067a5" }} />
                  <div>
                    <p className="text-xs font-semibold" style={{ color: "#333" }}>{opt.label}</p>
                    <p className="text-xs" style={{ color: "#888" }}>{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {source === "contacts" && (
              <>
                <input
                  value={searchContacts}
                  onChange={(e) => setSearchContacts(e.target.value)}
                  placeholder="Поиск по имени, email..."
                  className="w-full px-3 py-1.5 text-xs focus:outline-none"
                  style={{ border: "1px solid #d0d0d0", borderRadius: 4 }}
                />
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={selectAllContacts} className="text-xs hover:underline" style={{ color: "#0067a5" }}>
                    {selectedContacts.size === filteredContacts.length ? "Снять все" : "Выбрать все"}
                  </button>
                  <span className="text-xs" style={{ color: "#888" }}>Выбрано: {selectedContacts.size}</span>
                </div>
                <div className="max-h-60 overflow-y-auto rounded" style={{ border: "1px solid #e4e4e4" }}>
                  {filteredContacts.slice(0, 200).map((c: Contact) => (
                    <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <input type="checkbox" checked={selectedContacts.has(c.id)} onChange={() => toggleContact(c.id)}
                        style={{ accentColor: "#0067a5" }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium" style={{ color: "#333" }}>{c.full_name}</span>
                        <span className="text-xs ml-2" style={{ color: "#888" }}>{c.email}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}

            {source === "file" && (
              <div>
                <div
                  className="flex flex-col items-center justify-center py-8 cursor-pointer rounded-lg"
                  style={{ border: "2px dashed #d0d0d0", background: "#fafafa" }}
                  onClick={() => document.getElementById("campaign-file")?.click()}
                >
                  <Upload size={28} className="mb-2" style={{ color: "#ccc" }} />
                  <p className="text-xs" style={{ color: "#555" }}>Загрузите Excel с колонками: email, имя, компания, телефон</p>
                  <input id="campaign-file" type="file" accept=".xlsx,.xls,.csv" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                </div>
                {importedRecipients.length > 0 && (
                  <p className="text-xs mt-2" style={{ color: "#2e7d32" }}>Загружено: {importedRecipients.length} получателей</p>
                )}
              </div>
            )}

            <div className="flex justify-between">
              <Button size="sm" variant="secondary" onClick={() => setStep(1)}>← Назад</Button>
              <Button size="sm" onClick={() => setStep(3)} disabled={recipients.length === 0}>
                Далее → ({recipients.length} получателей)
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview & Send */}
        {step === 3 && (
          <div className="space-y-4">
            <Card>
              <CardBody>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div><span style={{ color: "#888" }}>Название:</span> <strong>{name}</strong></div>
                  <div><span style={{ color: "#888" }}>Получателей:</span> <strong>{recipients.length}</strong></div>
                  <div className="col-span-2"><span style={{ color: "#888" }}>Тема:</span> <strong>{subject}</strong></div>
                </div>
              </CardBody>
            </Card>

            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: "#888" }}>Предпросмотр (первый получатель):</p>
              <div className="p-4 rounded text-sm" style={{ background: "#fff", border: "1px solid #e4e4e4" }}>
                <p className="text-xs mb-2" style={{ color: "#888" }}>
                  Кому: <strong>{recipients[0]?.email}</strong>
                </p>
                <p className="text-xs mb-2" style={{ color: "#888" }}>
                  Тема: <strong>{recipients[0] ? subject.replace(/\{(\w+)\}/g, (_, k) => recipients[0].variables[k] ?? `{${k}}`) : subject}</strong>
                </p>
                <div className="whitespace-pre-wrap text-sm pt-2" style={{ borderTop: "1px solid #f0f0f0", color: "#333" }}>
                  {recipients[0]
                    ? bodyTemplate.replace(/\{(\w+)\}/g, (_, k) => recipients[0].variables[k] ?? `{${k}}`)
                    : bodyTemplate}
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button size="sm" variant="secondary" onClick={() => setStep(2)}>← Назад</Button>
              <Button size="sm" onClick={handleCreate} loading={loading}>
                <Mail size={13} /> Создать рассылку
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
