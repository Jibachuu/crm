"use client";

import { useState, useEffect } from "react";
import { Send, CheckCircle, XCircle, Clock, Eye, Mail, ChevronDown, ChevronUp, RefreshCw, Trash2, Reply } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  body_template: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  replied_count: number;
  created_at: string;
  sent_at: string | null;
}

interface Recipient {
  id: string;
  email: string;
  variables: Record<string, string>;
  status: string;
  error: string | null;
  sent_at: string | null;
  replied_at: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик", sending: "Отправляется", sent: "Отправлена", failed: "Ошибка",
};
const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = {
  draft: "default", sending: "warning", sent: "success", failed: "danger",
};

export default function CampaignsInbox() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [checkingReplies, setCheckingReplies] = useState(false);

  async function loadCampaigns() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("email_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    setCampaigns(data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadCampaigns(); }, []);

  async function selectCampaign(c: Campaign) {
    setSelectedCampaign(c);
    setLoadingRecipients(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("email_recipients")
      .select("*")
      .eq("campaign_id", c.id)
      .order("sent_at", { ascending: false });
    setRecipients(data ?? []);
    setLoadingRecipients(false);
  }

  async function deleteCampaign(id: string) {
    if (!confirm("Удалить рассылку?")) return;
    setDeleting(id);
    const res = await fetch("/api/email/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", campaign_id: id }),
    });
    if (res.ok) {
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      if (selectedCampaign?.id === id) { setSelectedCampaign(null); setRecipients([]); }
    }
    setDeleting(null);
  }

  async function checkReplies(campaignId: string) {
    setCheckingReplies(true);
    const res = await fetch("/api/email/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check_replies", campaign_id: campaignId }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.replied > 0) {
        // Refresh campaign and recipients
        await loadCampaigns();
        if (selectedCampaign) await selectCampaign({ ...selectedCampaign, replied_count: (selectedCampaign.replied_count ?? 0) + data.replied });
      }
    }
    setCheckingReplies(false);
  }

  const sentRecipients = recipients.filter((r) => r.status === "sent");
  const failedRecipients = recipients.filter((r) => r.status === "failed");
  const pendingRecipients = recipients.filter((r) => r.status === "pending");
  const repliedRecipients = recipients.filter((r) => r.replied_at);
  const replyRate = sentRecipients.length > 0 ? Math.round((repliedRecipients.length / sentRecipients.length) * 100) : 0;

  return (
    <div className="flex h-full">
      {/* Campaign list */}
      <div className="flex flex-col" style={{ width: 380, borderRight: "1px solid #e4e4e4", background: "#fff" }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
          <span className="text-xs font-semibold" style={{ color: "#888" }}>РАССЫЛКИ · {campaigns.length}</span>
          <button onClick={loadCampaigns} className="p-1 rounded hover:bg-slate-100">
            <RefreshCw size={13} style={{ color: "#888" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-xs text-center py-12" style={{ color: "#aaa" }}>Загрузка...</p>}
          {!loading && campaigns.length === 0 && (
            <div className="text-center py-12">
              <Send size={32} className="mx-auto mb-2" style={{ color: "#ddd" }} />
              <p className="text-xs" style={{ color: "#aaa" }}>Рассылок нет</p>
            </div>
          )}
          {campaigns.map((c) => (
            <div key={c.id}
              className="flex items-start transition-colors hover:bg-gray-50"
              style={{
                borderBottom: "1px solid #f5f5f5",
                background: selectedCampaign?.id === c.id ? "#e8f4fd" : "transparent",
              }}>
              <button onClick={() => selectCampaign(c)} className="flex-1 text-left px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate" style={{ color: "#333" }}>{c.name}</span>
                  <Badge variant={STATUS_VARIANTS[c.status] ?? "default"}>{STATUS_LABELS[c.status] ?? c.status}</Badge>
                </div>
                <p className="text-xs truncate" style={{ color: "#888" }}>{c.subject}</p>
                <div className="flex gap-3 mt-1 text-xs" style={{ color: "#aaa" }}>
                  <span>{c.total_recipients} получ.</span>
                  {c.sent_count > 0 && <span style={{ color: "#2e7d32" }}>{c.sent_count} отпр.</span>}
                  {(c.replied_count ?? 0) > 0 && <span style={{ color: "#0067a5" }}>{c.replied_count} отв.</span>}
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteCampaign(c.id); }}
                disabled={deleting === c.id}
                className="p-2 mt-3 mr-2 rounded hover:bg-red-50 transition-colors"
                title="Удалить"
              >
                <Trash2 size={13} style={{ color: "#c62828" }} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign detail */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: "#f5f5f5" }}>
        {!selectedCampaign ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Send size={48} style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Выберите рассылку</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-base font-semibold" style={{ color: "#333" }}>{selectedCampaign.name}</h2>
                  <Badge variant={STATUS_VARIANTS[selectedCampaign.status] ?? "default"}>
                    {STATUS_LABELS[selectedCampaign.status]}
                  </Badge>
                </div>
                <p className="text-xs" style={{ color: "#888" }}>Тема: <strong>{selectedCampaign.subject}</strong></p>
                {selectedCampaign.sent_at && (
                  <p className="text-xs mt-0.5" style={{ color: "#aaa" }}>Отправлена: {formatDateTime(selectedCampaign.sent_at)}</p>
                )}
              </div>
              <button onClick={() => deleteCampaign(selectedCampaign.id)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors"
                style={{ border: "1px solid #ffcdd2", color: "#c62828" }}>
                <Trash2 size={12} /> Удалить
              </button>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-5 gap-3 mb-4">
              {[
                { label: "Отправлено", value: selectedCampaign.sent_count, pct: null, icon: Send, color: "#2e7d32", bg: "#e8f5e9" },
                { label: "Ответили", value: repliedRecipients.length, pct: `${replyRate}%`, icon: Reply, color: "#0067a5", bg: "#e8f4fd" },
                { label: "Без ответа", value: sentRecipients.length - repliedRecipients.length, pct: sentRecipients.length > 0 ? `${100 - replyRate}%` : null, icon: Mail, color: "#888", bg: "#f5f5f5" },
                { label: "Ошибки", value: failedRecipients.length, pct: null, icon: XCircle, color: "#c62828", bg: "#fdecea" },
                { label: "Ожидают", value: pendingRecipients.length, pct: null, icon: Clock, color: "#e65c00", bg: "#fff3e0" },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="rounded-lg p-3" style={{ background: s.bg, border: `1px solid ${s.color}15` }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon size={13} style={{ color: s.color }} />
                      <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-bold" style={{ color: s.color }}>{s.value}</span>
                      {s.pct && <span className="text-sm font-semibold" style={{ color: s.color }}>{s.pct}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply rate bar + check replies button */}
            {sentRecipients.length > 0 && (
              <div className="mb-4 rounded-lg p-4" style={{ background: "#fff", border: "1px solid #e4e4e4" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: "#555" }}>Ответы</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "#888" }}>{repliedRecipients.length} из {sentRecipients.length}</span>
                    <button
                      onClick={() => checkReplies(selectedCampaign.id)}
                      disabled={checkingReplies}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors hover:bg-blue-50"
                      style={{ border: "1px solid #0067a5", color: "#0067a5" }}
                    >
                      <RefreshCw size={11} className={checkingReplies ? "animate-spin" : ""} />
                      {checkingReplies ? "Проверка..." : "Проверить"}
                    </button>
                  </div>
                </div>
                <div className="w-full h-3 rounded-full" style={{ background: "#f0f0f0" }}>
                  <div className="h-3 rounded-full transition-all" style={{ width: `${replyRate}%`, background: replyRate > 30 ? "#2e7d32" : replyRate > 10 ? "#0067a5" : "#888", minWidth: replyRate > 0 ? 8 : 0 }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs" style={{ color: "#aaa" }}>0%</span>
                  <span className="text-xs font-semibold" style={{ color: "#0067a5" }}>{replyRate}% ответов</span>
                  <span className="text-xs" style={{ color: "#aaa" }}>100%</span>
                </div>
              </div>
            )}

            {/* Template preview */}
            <div className="mb-4">
              <button onClick={() => setShowTemplate(!showTemplate)}
                className="flex items-center gap-2 text-xs font-semibold mb-2" style={{ color: "#555" }}>
                <Eye size={12} /> Текст письма
                {showTemplate ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showTemplate && (
                <div className="p-4 rounded text-sm whitespace-pre-wrap"
                  style={{ background: "#fff", border: "1px solid #e4e4e4", color: "#333" }}>
                  {selectedCampaign.body_template}
                </div>
              )}
            </div>

            {/* Recipients list */}
            <div>
              <h3 className="text-xs font-semibold mb-2" style={{ color: "#888" }}>ПОЛУЧАТЕЛИ ({recipients.length})</h3>
              {loadingRecipients ? (
                <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Загрузка...</p>
              ) : (
                <div className="rounded overflow-hidden" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: "#fafafa", borderBottom: "1px solid #e4e4e4" }}>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "#888" }}>Email</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "#888" }}>Имя</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "#888" }}>Доставка</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "#888" }}>Ответ</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "#888" }}>Отправлено</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((r) => (
                        <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                          <td className="px-3 py-2" style={{ color: "#333" }}>{r.email}</td>
                          <td className="px-3 py-2" style={{ color: "#666" }}>{r.variables?.["имя"] || "—"}</td>
                          <td className="px-3 py-2">
                            {r.status === "sent" && <span className="flex items-center gap-1" style={{ color: "#2e7d32" }}><CheckCircle size={11} /> Доставлено</span>}
                            {r.status === "failed" && (
                              <span className="flex items-center gap-1" style={{ color: "#c62828" }} title={r.error ?? ""}>
                                <XCircle size={11} /> Ошибка
                              </span>
                            )}
                            {r.status === "pending" && <span style={{ color: "#aaa" }}>Ожидает</span>}
                          </td>
                          <td className="px-3 py-2">
                            {r.replied_at ? (
                              <span className="flex items-center gap-1" style={{ color: "#0067a5" }}>
                                <Reply size={11} /> Да
                                <span className="text-xs" style={{ color: "#aaa" }}>{formatDateTime(r.replied_at)}</span>
                              </span>
                            ) : r.status === "sent" ? (
                              <span style={{ color: "#aaa" }}>Нет</span>
                            ) : (
                              <span style={{ color: "#ddd" }}>—</span>
                            )}
                          </td>
                          <td className="px-3 py-2" style={{ color: "#aaa" }}>
                            {r.sent_at ? formatDateTime(r.sent_at) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
