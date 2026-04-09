"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, FileText, PenLine, Check, X, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
}

interface Signature {
  id: string;
  name: string;
  body: string;
  is_default: boolean;
  user_id?: string;
  users?: { full_name: string };
}

const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };
const lblStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 };

export default function EmailTemplatesSettings() {
  const [tab, setTab] = useState<"templates" | "signatures">("templates");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);

  // Template editing
  const [editT, setEditT] = useState<Template | null>(null);
  const [newT, setNewT] = useState(false);
  const [tName, setTName] = useState("");
  const [tSubject, setTSubject] = useState("");
  const [tBody, setTBody] = useState("");
  const [saving, setSaving] = useState(false);

  // Signature editing
  const [editS, setEditS] = useState<Signature | null>(null);
  const [newS, setNewS] = useState(false);
  const [sName, setSName] = useState("");
  const [sBody, setSBody] = useState("");

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from("email_templates").select("*").order("created_at", { ascending: false }),
      supabase.from("email_signatures").select("*, users(full_name)").order("created_at", { ascending: false }),
    ]);
    setTemplates(t ?? []);
    setSignatures(s ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Templates CRUD ──
  function startNewTemplate() {
    setEditT(null); setNewT(true);
    setTName(""); setTSubject(""); setTBody("");
  }

  function startEditTemplate(t: Template) {
    setNewT(false); setEditT(t);
    setTName(t.name); setTSubject(t.subject); setTBody(t.body);
  }

  async function saveTemplate() {
    if (!tName.trim()) return;
    setSaving(true);
    const supabase = createClient();
    if (editT) {
      await supabase.from("email_templates").update({ name: tName, subject: tSubject, body: tBody }).eq("id", editT.id);
    } else {
      await supabase.from("email_templates").insert({ name: tName, subject: tSubject, body: tBody, created_by: (await supabase.auth.getUser()).data.user?.id });
    }
    setEditT(null); setNewT(false);
    setSaving(false);
    load();
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Удалить шаблон?")) return;
    const supabase = createClient();
    await supabase.from("email_templates").delete().eq("id", id);
    load();
  }

  // ── Signatures CRUD ──
  const [sUserId, setSUserId] = useState("");
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string }[]>([]);

  useEffect(() => {
    createClient().from("users").select("id, full_name").eq("is_active", true).order("full_name").then(({ data }) => setAllUsers(data ?? []));
  }, []);

  function startNewSignature() {
    setEditS(null); setNewS(true);
    setSName(""); setSBody(""); setSUserId("");
  }

  function startEditSignature(s: Signature) {
    setNewS(false); setEditS(s);
    setSName(s.name); setSBody(s.body); setSUserId(s.user_id ?? "");
  }

  async function saveSignature() {
    if (!sName.trim()) return;
    setSaving(true);
    const supabase = createClient();
    if (editS) {
      await supabase.from("email_signatures").update({ name: sName, body: sBody, user_id: sUserId || null }).eq("id", editS.id);
    } else {
      await supabase.from("email_signatures").insert({ name: sName, body: sBody, user_id: sUserId || null, created_by: (await supabase.auth.getUser()).data.user?.id });
    }
    setEditS(null); setNewS(false);
    setSaving(false);
    load();
  }

  async function deleteSignature(id: string) {
    if (!confirm("Удалить подпись?")) return;
    const supabase = createClient();
    await supabase.from("email_signatures").delete().eq("id", id);
    load();
  }

  async function setDefaultSignature(id: string) {
    const supabase = createClient();
    // Remove default from all
    await supabase.from("email_signatures").update({ is_default: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    // Set new default
    await supabase.from("email_signatures").update({ is_default: true }).eq("id", id);
    load();
  }

  const isEditing = newT || editT || newS || editS;

  return (
    <section>
      <h2 className="text-sm font-bold mb-3" style={{ color: "#333" }}>Шаблоны и подписи email</h2>
      <div className="rounded-lg" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
        {/* Tabs */}
        <div className="flex" style={{ borderBottom: "1px solid #e4e4e4" }}>
          {([
            { key: "templates", label: "Шаблоны писем", icon: FileText },
            { key: "signatures", label: "Подписи", icon: PenLine },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); setEditT(null); setEditS(null); setNewT(false); setNewS(false); }}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors"
              style={{ color: tab === t.key ? "#0067a5" : "#888", borderBottom: tab === t.key ? "2px solid #0067a5" : "2px solid transparent" }}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {loading && <p className="text-xs text-center py-8" style={{ color: "#aaa" }}>Загрузка...</p>}

          {/* ── Templates tab ── */}
          {!loading && tab === "templates" && (
            <div>
              {!isEditing && (
                <button onClick={startNewTemplate} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded mb-3 hover:bg-blue-50 transition-colors"
                  style={{ border: "1px solid #0067a5", color: "#0067a5" }}>
                  <Plus size={13} /> Новый шаблон
                </button>
              )}

              {(newT || editT) && (
                <div className="space-y-3 mb-4 p-4 rounded" style={{ background: "#fafafa", border: "1px solid #e4e4e4" }}>
                  <div>
                    <label style={lblStyle}>Название шаблона</label>
                    <input value={tName} onChange={(e) => setTName(e.target.value)} style={inputStyle} placeholder="Коммерческое предложение" />
                  </div>
                  <div>
                    <label style={lblStyle}>Тема письма</label>
                    <input value={tSubject} onChange={(e) => setTSubject(e.target.value)} style={inputStyle} placeholder="Предложение для {имя}" />
                  </div>
                  <div>
                    <label style={lblStyle}>Текст письма</label>
                    <textarea value={tBody} onChange={(e) => setTBody(e.target.value)} rows={6} style={{ ...inputStyle, resize: "vertical" }}
                      placeholder={"Здравствуйте, {имя}!\n\nВаш текст...\n\nС уважением,\nКоманда"} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={saveTemplate} disabled={saving || !tName.trim()} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded text-white disabled:opacity-50" style={{ background: "#0067a5" }}>
                      <Check size={12} /> {editT ? "Сохранить" : "Создать"}
                    </button>
                    <button onClick={() => { setEditT(null); setNewT(false); }} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded" style={{ color: "#888" }}>
                      <X size={12} /> Отмена
                    </button>
                  </div>
                </div>
              )}

              {templates.length === 0 && !newT && (
                <p className="text-xs text-center py-6" style={{ color: "#aaa" }}>Шаблонов нет. Создайте первый шаблон для быстрой отправки писем.</p>
              )}

              <div className="space-y-2">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-gray-50"
                    style={{ border: "1px solid #f0f0f0" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium" style={{ color: "#333" }}>{t.name}</p>
                      <p className="text-xs truncate" style={{ color: "#888" }}>Тема: {t.subject || "—"}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEditTemplate(t)} className="p-1.5 rounded hover:bg-blue-50"><PenLine size={12} style={{ color: "#0067a5" }} /></button>
                      <button onClick={() => deleteTemplate(t.id)} className="p-1.5 rounded hover:bg-red-50"><Trash2 size={12} style={{ color: "#c62828" }} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Signatures tab ── */}
          {!loading && tab === "signatures" && (
            <div>
              {!isEditing && (
                <button onClick={startNewSignature} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded mb-3 hover:bg-blue-50 transition-colors"
                  style={{ border: "1px solid #0067a5", color: "#0067a5" }}>
                  <Plus size={13} /> Новая подпись
                </button>
              )}

              {(newS || editS) && (
                <div className="space-y-3 mb-4 p-4 rounded" style={{ background: "#fafafa", border: "1px solid #e4e4e4" }}>
                  <div>
                    <label style={lblStyle}>Название подписи</label>
                    <input value={sName} onChange={(e) => setSName(e.target.value)} style={inputStyle} placeholder="Основная подпись" />
                  </div>
                  <div>
                    <label style={lblStyle}>Менеджер (привязка)</label>
                    <select value={sUserId} onChange={(e) => setSUserId(e.target.value)} style={inputStyle}>
                      <option value="">Общая (без привязки)</option>
                      {allUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lblStyle}>Текст подписи</label>
                    <textarea value={sBody} onChange={(e) => setSBody(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }}
                      placeholder={"С уважением,\nЖибек\nТел: +7 (999) 123-45-67\nart-evo.ru"} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={saveSignature} disabled={saving || !sName.trim()} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded text-white disabled:opacity-50" style={{ background: "#0067a5" }}>
                      <Check size={12} /> {editS ? "Сохранить" : "Создать"}
                    </button>
                    <button onClick={() => { setEditS(null); setNewS(false); }} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded" style={{ color: "#888" }}>
                      <X size={12} /> Отмена
                    </button>
                  </div>
                </div>
              )}

              {signatures.length === 0 && !newS && (
                <p className="text-xs text-center py-6" style={{ color: "#aaa" }}>Подписей нет. Создайте подпись — она будет автоматически добавляться к письмам.</p>
              )}

              <div className="space-y-2">
                {signatures.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-gray-50"
                    style={{ border: "1px solid #f0f0f0" }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium" style={{ color: "#333" }}>{s.name}</p>
                        {s.users?.full_name && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#e8f4fd", color: "#0067a5", fontSize: 10 }}>{s.users.full_name}</span>}
                        {s.is_default && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#fff3e0", color: "#e65c00", fontSize: 10 }}>По умолчанию</span>}
                      </div>
                      <p className="text-xs truncate" style={{ color: "#888" }}>{s.body.split("\n")[0]}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!s.is_default && (
                        <button onClick={() => setDefaultSignature(s.id)} className="p-1.5 rounded hover:bg-yellow-50" title="Сделать по умолчанию">
                          <Star size={12} style={{ color: "#e65c00" }} />
                        </button>
                      )}
                      <button onClick={() => startEditSignature(s)} className="p-1.5 rounded hover:bg-blue-50"><PenLine size={12} style={{ color: "#0067a5" }} /></button>
                      <button onClick={() => deleteSignature(s.id)} className="p-1.5 rounded hover:bg-red-50"><Trash2 size={12} style={{ color: "#c62828" }} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
