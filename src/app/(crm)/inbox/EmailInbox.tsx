"use client";

import { useState, useEffect } from "react";
import { Mail, RefreshCw, ArrowLeft, Paperclip, Reply, Send, Download, Link2, CheckCheck } from "lucide-react";
import EmailCompose from "@/components/ui/EmailCompose";
import LinkedEntitiesPanel from "@/components/ui/LinkedEntitiesPanel";

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
  hasAttachments: boolean;
  // DB sent emails
  dbId?: string;
  body?: string;
  dbAttachments?: { filename: string; size: number }[];
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

/** Normalize subject for threading: strip Re:/Fwd: prefixes */
function normalizeSubject(s: string) {
  return s.replace(/^(Re|Fwd|Fw):\s*/gi, "").trim().toLowerCase();
}

/** Get the "other party" email for a conversation */
function getConversationPartner(email: Email, myEmail: string) {
  if (email.folder !== "INBOX") {
    // Sent email — partner is the recipient
    return email.to.match(/<(.+?)>/)?.[1] ?? email.to.split(",")[0].trim();
  }
  return email.fromEmail;
}

export default function EmailInbox() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedThread, setSelectedThread] = useState<Email[] | null>(null);
  const [threadDetails, setThreadDetails] = useState<Map<string, EmailDetail>>(new Map());
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [linkedOpen, setLinkedOpen] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const myEmail = (process.env.NEXT_PUBLIC_SMTP_USER ?? "").toLowerCase();

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

  // Group emails into conversation threads by normalized subject
  function getThreads(): { key: string; subject: string; emails: Email[]; latest: Email; partner: string }[] {
    const threadMap = new Map<string, Email[]>();
    for (const em of emails) {
      const key = normalizeSubject(em.subject);
      if (!threadMap.has(key)) threadMap.set(key, []);
      threadMap.get(key)!.push(em);
    }
    const threads: { key: string; subject: string; emails: Email[]; latest: Email; partner: string }[] = [];
    for (const [key, threadEmails] of threadMap) {
      // Sort chronologically within thread
      threadEmails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const latest = threadEmails[threadEmails.length - 1];
      const partner = getConversationPartner(latest, myEmail);
      threads.push({ key, subject: latest.subject, emails: threadEmails, latest, partner });
    }
    // Sort threads by latest email date, newest first
    threads.sort((a, b) => new Date(b.latest.date).getTime() - new Date(a.latest.date).getTime());
    return threads;
  }

  async function openThread(threadEmails: Email[]) {
    setSelectedThread(threadEmails);
    setShowReply(false);
    setLoadingDetails(true);

    const details = new Map<string, EmailDetail>();
    await Promise.all(
      threadEmails.map(async (em) => {
        const key = em.dbId ? `SENT-${em.dbId}` : `${em.folder}-${em.uid}`;
        // DB sent emails — use data directly, no IMAP fetch needed
        if (em.dbId) {
          details.set(key, {
            uid: 0,
            subject: em.subject,
            from: em.from,
            fromEmail: em.fromEmail,
            to: em.to,
            date: em.date,
            html: null,
            text: em.body ?? "",
            attachments: (em.dbAttachments ?? []).map((a) => ({ filename: a.filename, contentType: "", size: a.size })),
          });
          return;
        }
        // IMAP emails — fetch from server
        try {
          const res = await fetch(`/api/email/read?uid=${em.uid}&folder=${encodeURIComponent(em.folder)}`);
          if (res.ok) {
            details.set(key, await res.json());
          }
        } catch { /* skip */ }
      })
    );
    setThreadDetails(details);
    setLoadingDetails(false);
  }

  async function markThreadAsRead(threadEmails: Email[]) {
    setMarkingRead(true);
    const unread = threadEmails.filter((e) => !e.seen && e.folder === "INBOX" && !e.dbId);
    try {
      await Promise.all(
        unread.map((e) =>
          fetch("/api/email/mark-read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid: e.uid, folder: e.folder }),
          })
        )
      );
      // Update local state
      setEmails((prev) =>
        prev.map((e) =>
          unread.some((u) => u.uid === e.uid && u.folder === e.folder) ? { ...e, seen: true } : e
        )
      );
      if (selectedThread) {
        setSelectedThread((prev) =>
          prev?.map((e) =>
            unread.some((u) => u.uid === e.uid && u.folder === e.folder) ? { ...e, seen: true } : e
          ) ?? null
        );
      }
    } catch {
      alert("Ошибка при пометке как прочитанное");
    }
    setMarkingRead(false);
  }

  const threads = getThreads();

  // Find reply-to address: the other party in the thread
  function getReplyTo(): string {
    if (!selectedThread?.length) return "";
    // Find the last incoming email's sender
    for (let i = selectedThread.length - 1; i >= 0; i--) {
      if (selectedThread[i].folder === "INBOX") return selectedThread[i].fromEmail;
    }
    // Fallback: first email's sender/recipient
    const first = selectedThread[0];
    return first.folder === "INBOX" ? first.fromEmail : (first.to.match(/<(.+?)>/)?.[1] ?? first.to);
  }

  return (
    <div className="flex h-full">
      {/* Thread list */}
      <div className="flex flex-col" style={{ width: 380, borderRight: "1px solid #e4e4e4", background: "#fff" }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
          <span className="text-xs font-semibold" style={{ color: "#888" }}>ПОЧТА · {threads.length}</span>
          <button onClick={refresh} disabled={refreshing} className="p-1 rounded hover:bg-slate-100 disabled:opacity-40">
            <RefreshCw size={13} style={{ color: "#888" }} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-xs text-center py-12" style={{ color: "#aaa" }}>Загрузка почты...</p>}
          {error && (
            <div className="p-4 text-center">
              <p className="text-xs" style={{ color: "#d32f2f" }}>{error}</p>
              <button onClick={loadEmails} className="text-xs underline mt-2" style={{ color: "#0067a5" }}>Повторить</button>
            </div>
          )}
          {!loading && !error && threads.length === 0 && (
            <div className="text-center py-12">
              <Mail size={32} className="mx-auto mb-2" style={{ color: "#ddd" }} />
              <p className="text-xs" style={{ color: "#aaa" }}>Нет писем</p>
            </div>
          )}
          {threads.map((thread) => {
            const isSent = thread.latest.folder !== "INBOX";
            const hasUnread = thread.emails.some((e) => !e.seen && e.folder === "INBOX");
            const isSelected = selectedThread?.[0] && normalizeSubject(selectedThread[0].subject) === thread.key;
            return (
              <button
                key={thread.key}
                onClick={() => openThread(thread.emails)}
                className="w-full text-left px-4 py-3 transition-colors hover:bg-gray-50"
                style={{ borderBottom: "1px solid #f5f5f5", background: isSelected ? "#e8f4fd" : "transparent" }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
                    style={{ background: isSent ? "#2e7d32" : hasUnread ? "#0067a5" : "#aaa" }}>
                    {isSent ? <Send size={13} /> : getInitials(thread.latest.from)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium truncate" style={{ color: "#333", fontWeight: hasUnread ? 600 : 400 }}>
                        {isSent ? `Кому: ${thread.partner}` : thread.latest.from.split("<")[0].trim()}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {thread.emails.length > 1 && (
                          <span className="text-xs px-1 rounded" style={{ background: "#e8f4fd", color: "#0067a5", fontSize: 10 }}>
                            {thread.emails.length}
                          </span>
                        )}
                        <span className="text-xs" style={{ color: "#aaa" }}>{formatDate(thread.latest.date)}</span>
                      </div>
                    </div>
                    <p className="text-xs truncate" style={{ color: "#333", fontWeight: hasUnread ? 600 : 400 }}>{thread.subject}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-xs truncate flex-1" style={{ color: "#999" }}>{thread.latest.preview}</p>
                      {thread.emails.some((e) => e.hasAttachments) && <Paperclip size={10} style={{ color: "#aaa" }} />}
                    </div>
                  </div>
                  {hasUnread && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: "#0067a5" }} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Thread detail / conversation view */}
      <div className="flex-1 flex min-w-0" style={{ background: "#f5f5f5" }}>
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedThread && !loadingDetails && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Mail size={48} style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Выберите переписку</p>
          </div>
        )}
        {loadingDetails && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: "#aaa" }}>Загрузка...</p>
          </div>
        )}
        {selectedThread && !loadingDetails && (
          <>
            {/* Thread header */}
            <div className="px-6 py-3 flex items-center justify-between" style={{ background: "#fff", borderBottom: "1px solid #e4e4e4" }}>
              <div className="flex items-center gap-3">
                <button onClick={() => { setSelectedThread(null); setThreadDetails(new Map()); setLinkedOpen(false); }} className="flex items-center gap-1 text-xs hover:underline" style={{ color: "#0067a5" }}>
                  <ArrowLeft size={12} />
                </button>
                <h2 className="text-sm font-semibold" style={{ color: "#333" }}>
                  {selectedThread[0].subject.replace(/^(Re|Fwd|Fw):\s*/gi, "")}
                </h2>
                <span className="text-xs" style={{ color: "#aaa" }}>{selectedThread.length} сообщ.</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedThread.some((e) => !e.seen && e.folder === "INBOX" && !e.dbId) && (
                  <button
                    onClick={() => markThreadAsRead(selectedThread)}
                    disabled={markingRead}
                    className="text-xs px-2 py-1 rounded hover:bg-green-50 flex items-center gap-1 disabled:opacity-50"
                    style={{ color: "#2e7d32", border: "1px solid #a5d6a7" }}
                    title="Отметить как прочитанное"
                  >
                    <CheckCheck size={11} /> {markingRead ? "..." : "Прочитано"}
                  </button>
                )}
                <button
                  onClick={() => setLinkedOpen(!linkedOpen)}
                  className="text-xs px-2 py-1 rounded hover:bg-blue-50 flex items-center gap-1"
                  style={{ color: "#0067a5", border: "1px solid #b3d4f0" }}
                  title="Связанные данные"
                >
                  <Link2 size={11} /> Связи
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedThread.map((em) => {
                const detailKey = em.dbId ? `SENT-${em.dbId}` : `${em.folder}-${em.uid}`;
                const detail = threadDetails.get(detailKey);
                const isSent = em.folder !== "INBOX";
                return (
                  <div key={detailKey}
                    className="rounded-lg p-4"
                    style={{
                      background: "#fff",
                      border: `1px solid ${isSent ? "#c8e6c9" : "#e4e4e4"}`,
                      marginLeft: isSent ? 40 : 0,
                      marginRight: isSent ? 0 : 40,
                    }}>
                    {/* Message header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: isSent ? "#2e7d32" : "#0067a5" }}>
                          {isSent ? <Send size={10} /> : getInitials(em.from)}
                        </div>
                        <div>
                          <span className="text-xs font-medium" style={{ color: isSent ? "#2e7d32" : "#333" }}>
                            {isSent ? "Вы" : em.from.split("<")[0].trim()}
                          </span>
                          <span className="text-xs ml-2" style={{ color: "#aaa" }}>
                            → {isSent ? em.to.split("<")[0].trim() : "Вам"}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs" style={{ color: "#aaa" }}>{formatDate(em.date)}</span>
                    </div>

                    {/* Subject (if different from thread) */}
                    {em.subject !== selectedThread[0].subject.replace(/^(Re|Fwd|Fw):\s*/gi, "") && (
                      <p className="text-xs mb-2" style={{ color: "#888" }}>Тема: {em.subject}</p>
                    )}

                    {/* Message body */}
                    {detail ? (
                      <>
                        {detail.html ? (
                          <div className="text-sm email-body" style={{ color: "#333" }}
                            dangerouslySetInnerHTML={{ __html: detail.html }} />
                        ) : (
                          <pre className="text-sm whitespace-pre-wrap" style={{ color: "#333", fontFamily: "inherit" }}>
                            {detail.text}
                          </pre>
                        )}

                        {/* Attachments with download */}
                        {detail.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3 pt-3" style={{ borderTop: "1px solid #f0f0f0" }}>
                            {detail.attachments.map((a, i) => (
                              <a key={i}
                                href={`/api/email/attachment?uid=${em.uid}&folder=${encodeURIComponent(em.folder)}&index=${i}`}
                                download={a.filename}
                                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded transition-colors hover:bg-blue-50"
                                style={{ background: "#f5f5f5", border: "1px solid #e0e0e0", color: "#0067a5" }}>
                                <Download size={11} />
                                <span>{a.filename}</span>
                                <span style={{ color: "#aaa" }}>({(a.size / 1024).toFixed(0)} КБ)</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs" style={{ color: "#aaa" }}>Не удалось загрузить содержимое</p>
                    )}
                  </div>
                );
              })}

              {/* Reply */}
              <div style={{ marginLeft: 40 }}>
                {!showReply ? (
                  <button
                    onClick={() => setShowReply(true)}
                    className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-lg transition-colors hover:bg-white"
                    style={{ border: "1px solid #d0d0d0", color: "#555", background: "#fff" }}
                  >
                    <Reply size={13} /> Ответить
                  </button>
                ) : (
                  <EmailCompose
                    to={getReplyTo()}
                    defaultSubject={`Re: ${selectedThread[0].subject.replace(/^(Re|Fwd|Fw):\s*/gi, "")}`}
                    onSent={() => { setShowReply(false); loadEmails().then(() => { /* thread will update on next open */ }); }}
                    onClose={() => setShowReply(false)}
                    compact
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
      {linkedOpen && selectedThread && (() => {
        const partnerEmail = selectedThread[selectedThread.length - 1].folder === "INBOX"
          ? selectedThread[selectedThread.length - 1].fromEmail
          : (selectedThread[selectedThread.length - 1].to.match(/<(.+?)>/)?.[1] ?? selectedThread[selectedThread.length - 1].to);
        const partnerName = selectedThread[selectedThread.length - 1].from.split("<")[0].trim();
        return (
          <div style={{ width: 320, borderLeft: "1px solid #e4e4e4" }}>
            <LinkedEntitiesPanel
              email={partnerEmail}
              displayName={partnerName || partnerEmail}
              channel="email"
              onClose={() => setLinkedOpen(false)}
            />
          </div>
        );
      })()}
      </div>
    </div>
  );
}
