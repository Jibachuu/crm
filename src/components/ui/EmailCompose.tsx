"use client";

import { useState, useEffect } from "react";
import { Send, X, Paperclip, FileText, ChevronDown } from "lucide-react";
import FileTemplatesPanel from "./FileTemplatesPanel";
import Button from "./Button";
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

interface Props {
  to: string;
  entityType?: string;
  entityId?: string;
  defaultSubject?: string;
  onSent?: () => void;
  onClose?: () => void;
  compact?: boolean;
}

export default function EmailCompose({ to, entityType, entityId, defaultSubject, onSent, onClose, compact = false }: Props) {
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentMsg, setSentMsg] = useState("");


  // Templates & signatures
  const [templates, setTemplates] = useState<Template[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [signatureAppended, setSignatureAppended] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    Promise.all([
      supabase.from("email_templates").select("*").order("name"),
      supabase.from("email_signatures").select("*, users(full_name)").order("created_at"),
    ]).then(([{ data: t }, { data: s }]) => {
      setTemplates(t ?? []);
      setSignatures(s ?? []);
    });
  }, []);

  // Auto-append signature: prefer current user's signature, then is_default
  useEffect(() => {
    if (signatureAppended || !signatures.length || !currentUserId) return;
    const mySig = signatures.find((s) => s.user_id === currentUserId);
    const defaultSig = signatures.find((s) => s.is_default);
    const sig = mySig || defaultSig;
    if (sig && !defaultSubject) {
      setBody((prev) => prev + "\n\n--\n" + sig.body);
      setSignatureAppended(true);
    }
  }, [signatures, currentUserId, defaultSubject, signatureAppended]);

  function applyTemplate(t: Template) {
    setSubject(t.subject);
    const defaultSig = signatures.find((s) => s.is_default);
    const sigBlock = defaultSig ? "\n\n--\n" + defaultSig.body : "";
    setBody(t.body + sigBlock);
    setSignatureAppended(!!defaultSig);
    setShowTemplates(false);
  }

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = () => reject(new Error("Ошибка чтения файла"));
      reader.readAsDataURL(file);
    });
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);

    try {
      const fileData: { name: string; type: string; data: string }[] = [];
      for (const f of files) {
        const b64 = await readFileAsBase64(f);
        fileData.push({ name: f.name, type: f.type || "application/octet-stream", data: b64 });
      }

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to, subject, body,
          entityType: entityType || undefined,
          entityId: entityId || undefined,
          files: fileData.length > 0 ? fileData : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert("Ошибка: " + (data.error ?? "не удалось отправить"));
        setSending(false);
        return;
      }
      const fileInfo = files.length > 0 ? ` (файлов: ${data.attachmentCount ?? 0})` : "";
      setSentMsg(`Отправлено${fileInfo}`);
      setSent(true);
      setTimeout(() => { setSent(false); setSentMsg(""); setSubject(""); setBody(""); setFiles([]); setSignatureAppended(false); onSent?.(); }, 3000);
    } catch (err) {
      alert("Ошибка отправки: " + String(err));
    }
    setSending(false);
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2 p-4 rounded" style={{ background: "#e8f5e9", border: "1px solid #a5d6a7" }}>
        <Send size={14} style={{ color: "#2e7d32" }} />
        <span className="text-sm font-medium" style={{ color: "#2e7d32" }}>{sentMsg || `Письмо отправлено на ${to}`}</span>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };

  return (
    <div className="rounded" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid #f0f0f0", background: "#fafafa" }}>
        <span className="text-xs font-semibold" style={{ color: "#555" }}>Новое письмо</span>
        <div className="flex items-center gap-1">
          {/* Template selector */}
          {templates.length > 0 && (
            <div className="relative">
              <button onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                style={{ color: "#0067a5" }}>
                <FileText size={12} /> Шаблон <ChevronDown size={10} />
              </button>
              {showTemplates && (
                <div className="absolute right-0 top-full mt-1 z-50 rounded shadow-lg py-1" style={{ background: "#fff", border: "1px solid #e4e4e4", minWidth: 200 }}>
                  {templates.map((t) => (
                    <button key={t.id} onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors" style={{ color: "#333" }}>
                      <p className="font-medium">{t.name}</p>
                      {t.subject && <p style={{ color: "#888" }}>Тема: {t.subject}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={14} style={{ color: "#aaa" }} /></button>
          )}
        </div>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs" style={{ color: "#888" }}>
          <span>Кому:</span>
          <span className="font-medium" style={{ color: "#333" }}>{to}</span>
        </div>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Тема письма"
          style={inputStyle}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Текст письма..."
          rows={compact ? 4 : 6}
          style={{ ...inputStyle, resize: "vertical" }}
        />
        {/* Attachments */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                style={{ background: "#f0f0f0", color: "#555" }}>
                <Paperclip size={10} /> {f.name} ({(f.size / 1024).toFixed(0)} КБ)
                <button onClick={() => removeFile(i)} className="ml-1 hover:text-red-600"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <label className="flex items-center gap-1 text-xs px-2 py-1.5 rounded hover:bg-gray-100 transition-colors cursor-pointer" style={{ color: "#888" }}>
              <Paperclip size={13} /> Файл
              <input type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <FileTemplatesPanel onInsert={(tplFiles) => {
              Promise.all(tplFiles.map((f) =>
                fetch(f.url).then((r) => r.blob()).then((blob) => new File([blob], f.name, { type: f.type || "application/octet-stream" }))
              )).then((newFiles) => setFiles((prev) => [...prev, ...newFiles]));
            }} />
            {/* Signature selector */}
            {signatures.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const sig = signatures.find((s) => s.id === e.target.value);
                  if (!sig) return;
                  // Replace existing signature or append
                  const sigMarker = "\n\n--\n";
                  const idx = body.indexOf(sigMarker);
                  const cleanBody = idx >= 0 ? body.slice(0, idx) : body;
                  setBody(cleanBody + sigMarker + sig.body);
                  setSignatureAppended(true);
                }}
                className="text-xs px-1.5 py-1 rounded"
                style={{ border: "1px solid #e0e0e0", color: "#888", maxWidth: 140 }}
              >
                <option value="">{signatureAppended ? "Сменить подпись" : "Добавить подпись"}</option>
                {signatures
                  .filter((s) => s.user_id === currentUserId || !s.user_id)
                  .map((s) => <option key={s.id} value={s.id}>{s.name}{(s as { users?: { full_name: string } }).users?.full_name ? ` (${(s as { users?: { full_name: string } }).users!.full_name})` : ""}</option>)}
                {signatures.filter((s) => s.user_id && s.user_id !== currentUserId).length > 0 && (
                  <option disabled>── Другие ──</option>
                )}
                {signatures
                  .filter((s) => s.user_id && s.user_id !== currentUserId)
                  .map((s) => <option key={s.id} value={s.id}>{s.name}{(s as { users?: { full_name: string } }).users?.full_name ? ` (${(s as { users?: { full_name: string } }).users!.full_name})` : ""}</option>)}
              </select>
            )}
          </div>
          <Button size="sm" onClick={handleSend} loading={sending} disabled={!subject.trim() || !body.trim()}>
            <Send size={13} /> Отправить
          </Button>
        </div>
      </div>
    </div>
  );
}
