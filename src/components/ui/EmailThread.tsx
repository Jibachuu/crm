"use client";

import { useState, useEffect } from "react";
import { Mail, RefreshCw, ChevronDown, ChevronUp, PenSquare } from "lucide-react";
import EmailCompose from "./EmailCompose";

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
  subject: string;
  from: string;
  to: string;
  date: string;
  html: string | null;
  text: string | null;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }) + " " + time;
}

export default function EmailThread({ email, compact = false, entityType, entityId, extraRecipients }: { email: string; compact?: boolean; entityType?: string; entityId?: string; extraRecipients?: { label: string; value: string }[] }) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUid, setExpandedUid] = useState<number | null>(null);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState(email);
  // Reply-to context (backlog v6 §5.2). When non-null, the compose form
  // mounts with a "Re: …" subject. We use this string as part of the key
  // below so a second "Ответить" click on a different email re-primes
  // EmailCompose instead of leaving the previous subject in place.
  const [replySubject, setReplySubject] = useState<string | null>(null);

  // Build recipient list: primary email first, then any extras (e.g. company email).
  const recipients = [
    { label: email, value: email },
    ...(extraRecipients ?? []).filter((r) => r.value && r.value !== email),
  ];

  async function loadEmails() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/email/inbox?limit=100&sent=1");
      if (!res.ok) { const d = await res.json(); setError(d.error); setLoading(false); return; }
      const data = await res.json();
      // Filter emails that involve this email address
      const filtered = (data.emails ?? []).filter((e: Email) =>
        e.fromEmail?.toLowerCase() === email.toLowerCase() ||
        e.to?.toLowerCase().includes(email.toLowerCase())
      );
      setEmails(filtered);
      // Sync to communications timeline
      if (entityType && entityId && filtered.length > 0) {
        fetch("/api/sync-messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: filtered.map((e: Email) => ({
              id: e.uid || (e as any).dbId || e.date,
              text: e.preview,
              subject: e.subject,
              isMe: e.folder === "SENT",
              sender: e.from,
              from: e.fromEmail,
              time: new Date(e.date).getTime(),
            })),
            channel: "email",
            entity_type: entityType,
            entity_id: entityId,
          }),
        }).catch(() => {});
      }
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  useEffect(() => { loadEmails(); }, [email]);

  async function toggleEmail(uid: number, folder = "INBOX") {
    if (expandedUid === uid) { setExpandedUid(null); setDetail(null); return; }
    setExpandedUid(uid);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/email/read?uid=${uid}&folder=${encodeURIComponent(folder)}`);
      if (res.ok) setDetail(await res.json());
    } catch { /* ignore */ }
    setLoadingDetail(false);
  }

  if (loading) {
    return <p className="text-xs text-center py-6" style={{ color: "#aaa" }}>Загрузка писем...</p>;
  }

  if (error) {
    return (
      <div className="text-center py-6">
        <p className="text-xs" style={{ color: "#d32f2f" }}>{error}</p>
        <button onClick={loadEmails} className="text-xs underline mt-1" style={{ color: "#0067a5" }}>Повторить</button>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="text-center py-8">
        <Mail size={24} className="mx-auto mb-2" style={{ color: "#ddd" }} />
        <p className="text-xs" style={{ color: "#aaa" }}>Нет переписки с {email}</p>
        <button onClick={() => setComposeOpen(true)} className="flex items-center gap-1 text-xs mt-2 mx-auto px-3 py-1.5 rounded"
          style={{ background: "#0067a5", color: "#fff" }}>
          <PenSquare size={11} /> Написать письмо
        </button>
        {composeOpen && (
          <div className="mt-3 text-left">
            <EmailCompose to={composeTo} recipients={recipients} entityType={entityType} entityId={entityId} compact
              onClose={() => setComposeOpen(false)} onSent={() => { setComposeOpen(false); loadEmails(); }}
              onChangeTo={setComposeTo} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: "#888" }}>
          Переписка с <strong style={{ color: "#333" }}>{email}</strong> · {emails.length} писем
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => setComposeOpen(!composeOpen)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors"
            style={{ border: "1px solid #0067a5", color: "#0067a5" }}>
            <PenSquare size={11} /> Написать
          </button>
          <button onClick={loadEmails} className="p-1 rounded hover:bg-gray-100" title="Обновить">
            <RefreshCw size={12} style={{ color: "#888" }} />
          </button>
        </div>
      </div>

      {composeOpen && (
        <div className="mb-3">
          {/* `key` includes replySubject so clicking "Ответить" on a
              different email remounts EmailCompose with the new "Re: …"
              prefill instead of keeping whatever the user previously
              typed. */}
          <EmailCompose
            key={`${composeTo}::${replySubject ?? ""}`}
            to={composeTo}
            recipients={recipients}
            entityType={entityType}
            entityId={entityId}
            defaultSubject={replySubject ?? undefined}
            compact
            onClose={() => { setComposeOpen(false); setReplySubject(null); }}
            onSent={() => { setComposeOpen(false); setReplySubject(null); loadEmails(); }}
            onChangeTo={setComposeTo}
          />
        </div>
      )}

      <div className="space-y-2" style={{ maxHeight: compact ? 400 : 600, overflowY: "auto" }}>
        {emails.map((em) => {
          const isExpanded = expandedUid === em.uid;
          const isIncoming = em.fromEmail?.toLowerCase() === email.toLowerCase();
          return (
            <div key={`${em.folder}-${em.uid}`} className="rounded" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
              <button
                onClick={() => toggleEmail(em.uid, em.folder)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: isIncoming ? "#e8f4fd" : "#e8f5e9" }}>
                  <Mail size={11} style={{ color: isIncoming ? "#0067a5" : "#2e7d32" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate" style={{ color: "#333", fontWeight: em.seen ? 400 : 600 }}>
                      {isIncoming ? "Входящее" : "Исходящее"}: {em.subject}
                    </span>
                    <span className="text-xs flex-shrink-0 ml-2" style={{ color: "#aaa" }}>{formatDate(em.date)}</span>
                  </div>
                  {!isExpanded && <p className="text-xs truncate mt-0.5" style={{ color: "#999" }}>{em.preview}</p>}
                </div>
                {isExpanded ? <ChevronUp size={14} style={{ color: "#aaa" }} /> : <ChevronDown size={14} style={{ color: "#aaa" }} />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4" style={{ borderTop: "1px solid #f0f0f0", maxHeight: 600, overflowY: "auto" }}>
                  {loadingDetail ? (
                    <p className="text-xs py-4 text-center" style={{ color: "#aaa" }}>Загрузка...</p>
                  ) : detail ? (
                    <div className="mt-3">
                      <div className="text-xs mb-2 space-y-0.5 flex items-start justify-between gap-3" style={{ color: "#888" }}>
                        <div>
                          <p>От: <strong style={{ color: "#333" }}>{detail.from}</strong></p>
                          <p>Кому: {detail.to}</p>
                        </div>
                        {/* Backlog v6 §5.2 — operators wanted to reply
                            directly to a received email instead of
                            composing a fresh one from scratch. Pull the
                            sender into `to` and prepend "Re: " to the
                            subject; the compose modal opens already
                            primed. */}
                        {isIncoming && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const sender = (detail.from.match(/<([^>]+)>/)?.[1] ?? detail.from).trim();
                              const baseSubj = (detail.subject || "").replace(/^\s*(re:\s*)+/i, "").trim();
                              setComposeTo(sender);
                              setReplySubject(`Re: ${baseSubj}`);
                              setComposeOpen(true);
                              // Scroll the compose box into view if the
                              // user is deep in the thread.
                              setTimeout(() => {
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }, 50);
                            }}
                            className="flex-shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors"
                            style={{ border: "1px solid #0067a5", color: "#0067a5" }}
                            title={`Ответить на «${detail.subject}»`}
                          >
                            <PenSquare size={11} /> Ответить
                          </button>
                        )}
                      </div>
                      {detail.html ? (
                        <div className="text-sm mt-2 p-3 rounded" style={{ background: "#fafafa", border: "1px solid #f0f0f0" }}
                          dangerouslySetInnerHTML={{ __html: detail.html }} />
                      ) : (
                        <pre className="text-sm mt-2 p-3 rounded whitespace-pre-wrap" style={{ background: "#fafafa", color: "#333" }}>
                          {detail.text}
                        </pre>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
