"use client";

import { useState, useEffect, useMemo } from "react";
import { Mail, RefreshCw, ArrowLeft, Paperclip, Reply, Send, Download, Link2, CheckCheck, Search, MoreVertical, Inbox as InboxIcon, FileText, Trash2, AlertOctagon } from "lucide-react";
import EmailCompose from "@/components/ui/EmailCompose";
import LinkedEntitiesPanel from "@/components/ui/LinkedEntitiesPanel";
import ChatListSkeleton from "@/components/inbox/ChatListSkeleton";

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
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "вчера";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function getInitials(name: string) {
  return name.split(/[\s@]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

function normalizeSubject(s: string) {
  return s.replace(/^(Re|Fwd|Fw):\s*/gi, "").trim().toLowerCase();
}

function getConversationPartner(email: Email) {
  if (email.folder !== "INBOX") {
    return email.to.match(/<(.+?)>/)?.[1] ?? email.to.split(",")[0].trim();
  }
  return email.fromEmail;
}

type Folder = "ALL" | "INBOX" | "SENT" | "DRAFTS" | "TRASH" | "SPAM";

const FOLDER_META: Record<Folder, { label: string; icon: React.ComponentType<{ size?: number }> }> = {
  ALL: { label: "Все", icon: Mail },
  INBOX: { label: "Входящие", icon: InboxIcon },
  SENT: { label: "Отправленные", icon: Send },
  DRAFTS: { label: "Черновики", icon: FileText },
  TRASH: { label: "Удалённые", icon: Trash2 },
  SPAM: { label: "Спам", icon: AlertOctagon },
};

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
  const [folder, setFolder] = useState<Folder>("ALL");
  const [search, setSearch] = useState("");

  async function loadEmails(f: Folder = folder) {
    setLoading(true);
    setError(null);
    try {
      const sentParam = f === "ALL" || f === "SENT" ? "&sent=1" : "";
      const res = await fetch(`/api/email/inbox?limit=50&folder=${f}${sentParam}`);
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

  useEffect(() => { loadEmails(folder); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [folder]);

  const threads = useMemo(() => {
    const q = search.trim().toLowerCase();
    const threadMap = new Map<string, Email[]>();
    for (const em of emails) {
      if (q) {
        const hay = `${em.subject} ${em.from} ${em.fromEmail} ${em.to} ${em.preview}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const key = normalizeSubject(em.subject);
      if (!threadMap.has(key)) threadMap.set(key, []);
      threadMap.get(key)!.push(em);
    }
    const arr: { key: string; subject: string; emails: Email[]; latest: Email; partner: string }[] = [];
    for (const [key, threadEmails] of threadMap) {
      threadEmails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const latest = threadEmails[threadEmails.length - 1];
      const partner = getConversationPartner(latest);
      arr.push({ key, subject: latest.subject, emails: threadEmails, latest, partner });
    }
    arr.sort((a, b) => (new Date(b.latest.date).getTime() - new Date(a.latest.date).getTime()) || a.key.localeCompare(b.key));
    return arr;
  }, [emails, search]);

  async function openThread(threadEmails: Email[]) {
    setSelectedThread(threadEmails);
    setShowReply(false);
    setLoadingDetails(true);

    const details = new Map<string, EmailDetail>();
    await Promise.all(
      threadEmails.map(async (em) => {
        const key = em.dbId ? `SENT-${em.dbId}` : `${em.folder}-${em.uid}`;
        if (em.dbId) {
          details.set(key, {
            uid: 0, subject: em.subject, from: em.from, fromEmail: em.fromEmail,
            to: em.to, date: em.date, html: null, text: em.body ?? "",
            attachments: (em.dbAttachments ?? []).map((a) => ({ filename: a.filename, contentType: "", size: a.size })),
          });
          return;
        }
        try {
          const res = await fetch(`/api/email/read?uid=${em.uid}&folder=${encodeURIComponent(em.folder)}`);
          if (res.ok) details.set(key, await res.json());
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
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid: e.uid, folder: e.folder }),
          })
        )
      );
      setEmails((prev) =>
        prev.map((e) => unread.some((u) => u.uid === e.uid && u.folder === e.folder) ? { ...e, seen: true } : e)
      );
      if (selectedThread) {
        setSelectedThread((prev) =>
          prev?.map((e) => unread.some((u) => u.uid === e.uid && u.folder === e.folder) ? { ...e, seen: true } : e) ?? null
        );
      }
    } catch { /* skip */ }
    setMarkingRead(false);
  }

  function getReplyTo(): string {
    if (!selectedThread?.length) return "";
    for (let i = selectedThread.length - 1; i >= 0; i--) {
      if (selectedThread[i].folder === "INBOX") return selectedThread[i].fromEmail;
    }
    const first = selectedThread[0];
    return first.folder === "INBOX" ? first.fromEmail : (first.to.match(/<(.+?)>/)?.[1] ?? first.to);
  }

  const isSelected = (key: string) => selectedThread?.[0] && normalizeSubject(selectedThread[0].subject) === key;

  return (
    <div className="inbox-scope inbox-shell" style={{ flexDirection: "row" }}>
      {/* Sidebar: folders + thread list */}
      <aside className="inbox-sidebar" style={{ width: 380 }}>
        <div className="inbox-sidebar-header">
          <div className="inbox-search">
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск писем"
              autoComplete="off"
            />
          </div>
          <button onClick={refresh} disabled={refreshing} className="inbox-sidebar-btn" title="Обновить">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Folder tabs */}
        <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid var(--tg-border)", background: "var(--tg-bg-panel)", flexShrink: 0 }}>
          {(Object.keys(FOLDER_META) as Folder[]).map((f) => {
            const Icon = FOLDER_META[f].icon;
            const active = folder === f;
            return (
              <button
                key={f}
                onClick={() => setFolder(f)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 12px", fontSize: 12, whiteSpace: "nowrap",
                  color: active ? "var(--tg-accent)" : "var(--tg-text-secondary)",
                  background: "transparent", border: "none",
                  borderBottom: active ? "2px solid var(--tg-accent)" : "2px solid transparent",
                  marginBottom: -1, cursor: "pointer",
                }}
              >
                <Icon size={12} /> {FOLDER_META[f].label}
              </button>
            );
          })}
        </div>

        <div className="inbox-chatlist">
          {loading && <ChatListSkeleton count={6} />}
          {!loading && error && (
            <div style={{ textAlign: "center", padding: "48px 16px" }}>
              <p style={{ fontSize: 13, marginBottom: 8, color: "#e57373" }}>{error}</p>
              <button onClick={() => loadEmails()} style={{ fontSize: 12, background: "transparent", border: "none", color: "var(--tg-accent)", cursor: "pointer", textDecoration: "underline" }}>
                Повторить
              </button>
            </div>
          )}
          {!loading && !error && threads.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 16px", color: "var(--tg-text-secondary)" }}>
              <Mail size={40} style={{ opacity: 0.35, marginBottom: 8 }} />
              <p style={{ fontSize: 13 }}>{search ? "Ничего не найдено" : "Нет писем"}</p>
            </div>
          )}
          {threads.map((thread) => {
            const isSent = thread.latest.folder !== "INBOX";
            const hasUnread = thread.emails.some((e) => !e.seen && e.folder === "INBOX");
            const senderName = isSent ? `Кому: ${thread.partner}` : thread.latest.from.split("<")[0].trim();
            const selected = isSelected(thread.key);
            return (
              <button
                key={thread.key}
                onClick={() => openThread(thread.emails)}
                className={`inbox-chat-item ${selected ? "is-selected" : ""} ${hasUnread ? "is-unread" : ""}`}
              >
                <div className="inbox-chat-avatar-wrap">
                  <div className="inbox-chat-avatar" style={{ background: isSent ? "linear-gradient(135deg, #4dcd5e, #2e7d32)" : "linear-gradient(135deg, #6ab7ff, #2b5278)" }}>
                    {isSent ? <Send size={20} /> : getInitials(thread.latest.from)}
                  </div>
                  <div className="inbox-chat-channel-badge" style={{ background: "#7d8b99" }}>@</div>
                </div>
                <div className="inbox-chat-body">
                  <div className="inbox-chat-toprow">
                    <span className="inbox-chat-name">{senderName}</span>
                    <span className="inbox-chat-time">{formatDate(thread.latest.date)}</span>
                  </div>
                  <div className="inbox-chat-bottomrow">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: hasUnread ? 500 : 400, color: hasUnread ? "var(--tg-text)" : "var(--tg-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {thread.subject.replace(/^(Re|Fwd|Fw):\s*/gi, "") || "(без темы)"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--tg-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {thread.latest.preview}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      {thread.emails.some((e) => e.hasAttachments) && <Paperclip size={11} style={{ opacity: 0.5 }} />}
                      {thread.emails.length > 1 && (
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "var(--tg-accent-dim)", color: "var(--tg-accent)" }}>
                          {thread.emails.length}
                        </span>
                      )}
                      {hasUnread && <span className="inbox-chat-unread is-dot" />}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main: thread detail */}
      <div className="inbox-main">
        {!selectedThread && !loadingDetails && (
          <div className="inbox-empty">
            <Mail size={44} style={{ opacity: 0.35 }} />
            <div className="inbox-empty-badge">Выберите переписку</div>
          </div>
        )}

        {loadingDetails && !selectedThread && (
          <div className="inbox-empty">
            <span style={{ fontSize: 13, color: "var(--tg-text-secondary)" }}>Загрузка...</span>
          </div>
        )}

        {selectedThread && (
          <>
            {/* Header */}
            <div className="inbox-chat-header">
              <button
                onClick={() => { setSelectedThread(null); setThreadDetails(new Map()); setLinkedOpen(false); }}
                className="inbox-sidebar-btn inbox-back-btn"
                title="Назад"
                style={{ flexShrink: 0 }}
              >
                <ArrowLeft size={18} />
              </button>
              <div className="inbox-chat-header-body">
                <div className="inbox-chat-header-name">
                  {selectedThread[0].subject.replace(/^(Re|Fwd|Fw):\s*/gi, "") || "(без темы)"}
                </div>
                <div className="inbox-chat-header-sub">{selectedThread.length} сообщ. · {selectedThread[selectedThread.length - 1].fromEmail}</div>
              </div>
              <div className="inbox-chat-header-actions">
                {selectedThread.some((e) => !e.seen && e.folder === "INBOX" && !e.dbId) && (
                  <button
                    onClick={() => markThreadAsRead(selectedThread)}
                    disabled={markingRead}
                    className="inbox-sidebar-btn"
                    title="Отметить как прочитанное"
                  >
                    <CheckCheck size={16} />
                  </button>
                )}
                <button onClick={() => setLinkedOpen(!linkedOpen)} className="inbox-sidebar-btn" title="Связанные данные">
                  <Link2 size={16} />
                </button>
                <button className="inbox-sidebar-btn" title="Меню"><MoreVertical size={16} /></button>
              </div>
            </div>

            {/* Messages */}
            <div className="inbox-chat-area" style={{ overflowY: "auto" }}>
              {loadingDetails && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--tg-text-secondary)", fontSize: 13 }}>Загрузка...</div>
              )}
              <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
                {selectedThread.map((em) => {
                  const detailKey = em.dbId ? `SENT-${em.dbId}` : `${em.folder}-${em.uid}`;
                  const detail = threadDetails.get(detailKey);
                  const isSent = em.folder !== "INBOX";
                  return (
                    <div
                      key={detailKey}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 12,
                        background: isSent ? "var(--tg-bg-own)" : "var(--tg-bg-secondary)",
                        color: "var(--tg-text)",
                        alignSelf: isSent ? "flex-end" : "flex-start",
                        maxWidth: "min(720px, 88%)",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: isSent ? "linear-gradient(135deg, #4dcd5e, #2e7d32)" : "linear-gradient(135deg, #6ab7ff, #2b5278)",
                            color: "#fff", fontSize: 11, fontWeight: 600,
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            {isSent ? <Send size={12} /> : getInitials(em.from)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {isSent ? "Вы" : em.from.split("<")[0].trim()}
                            </div>
                            <div style={{ fontSize: 11, opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              → {isSent ? em.to.split("<")[0].trim() : "Вам"}
                            </div>
                          </div>
                        </div>
                        <span style={{ fontSize: 11, opacity: 0.7, whiteSpace: "nowrap" }}>{formatDate(em.date)}</span>
                      </div>

                      {em.subject !== selectedThread[0].subject.replace(/^(Re|Fwd|Fw):\s*/gi, "") && (
                        <p style={{ fontSize: 12, marginBottom: 6, opacity: 0.7 }}>Тема: {em.subject}</p>
                      )}

                      {detail ? (
                        <>
                          {detail.html ? (
                            <div
                              className="email-body"
                              style={{ fontSize: 14, lineHeight: 1.45, background: "#ffffff", color: "#222", padding: "10px 12px", borderRadius: 8, marginTop: 4 }}
                              dangerouslySetInnerHTML={{ __html: detail.html }}
                            />
                          ) : (
                            <pre style={{ fontSize: 14, whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{detail.text}</pre>
                          )}

                          {detail.attachments.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                              {detail.attachments.map((a, i) => (
                                <a
                                  key={i}
                                  href={`/api/email/attachment?uid=${em.uid}&folder=${encodeURIComponent(em.folder)}&index=${i}`}
                                  download={a.filename}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                    fontSize: 12, padding: "6px 10px", borderRadius: 8,
                                    background: "rgba(255,255,255,0.10)", color: "inherit",
                                    textDecoration: "none",
                                  }}
                                >
                                  <Download size={12} /> {a.filename}
                                  <span style={{ opacity: 0.6 }}>({(a.size / 1024).toFixed(0)} КБ)</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <p style={{ fontSize: 12, opacity: 0.6 }}>Загружаем содержимое…</p>
                      )}
                    </div>
                  );
                })}

                {/* Reply */}
                <div style={{ alignSelf: "flex-start", width: "100%", marginTop: 8 }}>
                  {!showReply ? (
                    <button
                      onClick={() => setShowReply(true)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "10px 16px", fontSize: 13,
                        background: "var(--tg-bg-panel)", color: "var(--tg-text)",
                        border: "1px solid var(--tg-border-subtle)", borderRadius: 10,
                        cursor: "pointer",
                      }}
                    >
                      <Reply size={14} /> Ответить
                    </button>
                  ) : (
                    <div style={{ background: "var(--tg-bg-panel)", borderRadius: 12, padding: 8, marginBottom: 20 }}>
                      <EmailCompose
                        to={getReplyTo()}
                        defaultSubject={`Re: ${selectedThread[0].subject.replace(/^(Re|Fwd|Fw):\s*/gi, "")}`}
                        onSent={() => { setShowReply(false); loadEmails(); }}
                        onClose={() => setShowReply(false)}
                        compact
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right panel */}
      {linkedOpen && selectedThread && (() => {
        const partnerEmail = selectedThread[selectedThread.length - 1].folder === "INBOX"
          ? selectedThread[selectedThread.length - 1].fromEmail
          : (selectedThread[selectedThread.length - 1].to.match(/<(.+?)>/)?.[1] ?? selectedThread[selectedThread.length - 1].to);
        const partnerName = selectedThread[selectedThread.length - 1].from.split("<")[0].trim();
        return (
          <aside className="inbox-rightpanel">
            <LinkedEntitiesPanel
              email={partnerEmail}
              displayName={partnerName || partnerEmail}
              channel="email"
              onClose={() => setLinkedOpen(false)}
            />
          </aside>
        );
      })()}
    </div>
  );
}
