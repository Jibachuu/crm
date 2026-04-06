"use client";

import { useState, useEffect } from "react";
import { Mail, RefreshCw, ArrowLeft, Paperclip, Reply, Send } from "lucide-react";
import EmailCompose from "@/components/ui/EmailCompose";

interface Email {
  uid: number;
  folder: string;
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  date: string;
  preview: string;
  seen: boolean;
}

interface EmailDetail {
  uid: number;
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  date: string;
  html: string | null;
  text: string | null;
  attachments: { filename: string; contentType: string; size: number }[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + time;
}

function getInitials(name: string) {
  return name.split(/[\s@]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

export default function EmailInbox() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showReply, setShowReply] = useState(false);

  async function loadEmails() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/email/inbox?limit=50&sent=1");
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setEmails(data.emails ?? []);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  async function refresh() {
    setRefreshing(true);
    await loadEmails();
    setRefreshing(false);
  }

  useEffect(() => { loadEmails(); }, []);

  async function openEmail(uid: number, folder = "INBOX") {
    setLoadingDetail(true);
    setShowReply(false);
    try {
      const res = await fetch(`/api/email/read?uid=${uid}&folder=${encodeURIComponent(folder)}`);
      const data = await res.json();
      if (res.ok) setSelectedEmail(data);
      else alert(data.error);
    } catch (e) {
      alert(String(e));
    }
    setLoadingDetail(false);
  }

  return (
    <div className="flex h-full">
      {/* Email list */}
      <div className="flex flex-col" style={{ width: 380, borderRight: "1px solid #e4e4e4", background: "#fff" }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
          <span className="text-xs font-semibold" style={{ color: "#888" }}>ПОЧТА · {emails.length}</span>
          <button onClick={refresh} disabled={refreshing} className="p-1 rounded hover:bg-slate-100 disabled:opacity-40">
            <RefreshCw size={13} style={{ color: "#888" }} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <p className="text-xs text-center py-12" style={{ color: "#aaa" }}>Загрузка почты...</p>
          )}
          {error && (
            <div className="p-4 text-center">
              <p className="text-xs" style={{ color: "#d32f2f" }}>{error}</p>
              <button onClick={loadEmails} className="text-xs underline mt-2" style={{ color: "#0067a5" }}>Повторить</button>
            </div>
          )}
          {!loading && !error && emails.length === 0 && (
            <div className="text-center py-12">
              <Mail size={32} className="mx-auto mb-2" style={{ color: "#ddd" }} />
              <p className="text-xs" style={{ color: "#aaa" }}>Нет писем</p>
            </div>
          )}
          {emails.map((email) => {
            const isSent = email.folder !== "INBOX";
            return (
              <button
                key={`${email.folder}-${email.uid}`}
                onClick={() => openEmail(email.uid, email.folder)}
                className="w-full text-left px-4 py-3 transition-colors hover:bg-gray-50"
                style={{
                  borderBottom: "1px solid #f5f5f5",
                  background: selectedEmail?.uid === email.uid ? "#e8f4fd" : "transparent",
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
                    style={{ background: isSent ? "#2e7d32" : email.seen ? "#aaa" : "#0067a5" }}>
                    {isSent ? <Send size={13} /> : getInitials(email.from)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium truncate" style={{ color: "#333", fontWeight: email.seen ? 400 : 600 }}>
                        {isSent ? `Кому: ${email.to.split("<")[0].trim() || email.to}` : (email.from.split("<")[0].trim() || email.fromEmail)}
                      </span>
                      <span className="text-xs flex-shrink-0 ml-2" style={{ color: "#aaa" }}>{formatDate(email.date)}</span>
                    </div>
                    <p className="text-xs truncate" style={{ color: "#333", fontWeight: email.seen ? 400 : 600 }}>{email.subject}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: "#999" }}>{email.preview}</p>
                  </div>
                  {!isSent && !email.seen && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: "#0067a5" }} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Email detail */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: "#f5f5f5" }}>
        {!selectedEmail && !loadingDetail && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Mail size={48} style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Выберите письмо для просмотра</p>
          </div>
        )}
        {loadingDetail && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: "#aaa" }}>Загрузка...</p>
          </div>
        )}
        {selectedEmail && !loadingDetail && (
          <>
            {/* Email header */}
            <div className="px-6 py-4" style={{ background: "#fff", borderBottom: "1px solid #e4e4e4" }}>
              <button onClick={() => setSelectedEmail(null)} className="flex items-center gap-1 text-xs mb-3 hover:underline" style={{ color: "#0067a5" }}>
                <ArrowLeft size={12} /> К списку
              </button>
              <h2 className="text-base font-semibold mb-2" style={{ color: "#333" }}>{selectedEmail.subject}</h2>
              <div className="flex items-center gap-3 text-xs" style={{ color: "#666" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: "#0067a5" }}>
                  {getInitials(selectedEmail.from)}
                </div>
                <div>
                  <p className="font-medium" style={{ color: "#333" }}>{selectedEmail.from}</p>
                  <p>Кому: {selectedEmail.to}</p>
                </div>
                <span className="ml-auto" style={{ color: "#aaa" }}>{formatDate(selectedEmail.date)}</span>
              </div>
              {selectedEmail.attachments.length > 0 && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {selectedEmail.attachments.map((a, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                      style={{ background: "#f0f0f0", color: "#555" }}>
                      <Paperclip size={10} /> {a.filename} ({(a.size / 1024).toFixed(0)} КБ)
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Email body */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedEmail.html ? (
                <div
                  className="bg-white rounded p-6 text-sm"
                  style={{ border: "1px solid #e4e4e4", maxWidth: 800 }}
                  dangerouslySetInnerHTML={{ __html: selectedEmail.html }}
                />
              ) : (
                <pre className="bg-white rounded p-6 text-sm whitespace-pre-wrap"
                  style={{ border: "1px solid #e4e4e4", maxWidth: 800, color: "#333" }}>
                  {selectedEmail.text}
                </pre>
              )}

              {/* Reply */}
              <div className="mt-4" style={{ maxWidth: 800 }}>
                {!showReply ? (
                  <button
                    onClick={() => setShowReply(true)}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded transition-colors hover:bg-white"
                    style={{ border: "1px solid #d0d0d0", color: "#555" }}
                  >
                    <Reply size={13} /> Ответить
                  </button>
                ) : (
                  <EmailCompose
                    to={selectedEmail.fromEmail}
                    defaultSubject={`Re: ${selectedEmail.subject.replace(/^Re:\s*/i, "")}`}
                    onSent={() => { setShowReply(false); loadEmails(); }}
                    onClose={() => setShowReply(false)}
                    compact
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
