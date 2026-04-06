"use client";

import { useState, useEffect } from "react";
import { Send, CheckCircle, XCircle, Clock, Eye, Mail, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
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

  const sentRecipients = recipients.filter((r) => r.status === "sent");
  const failedRecipients = recipients.filter((r) => r.status === "failed");
  const pendingRecipients = recipients.filter((r) => r.status === "pending");

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
              <p className="text-xs mt-1" style={{ color: "#ccc" }}>Создайте рассылку в разделе Рассылки</p>
            </div>
          )}
          {campaigns.map((c) => (
            <button key={c.id} onClick={() => selectCampaign(c)}
              className="w-full text-left px-4 py-3 transition-colors hover:bg-gray-50"
              style={{
                borderBottom: "1px solid #f5f5f5",
                background: selectedCampaign?.id === c.id ? "#e8f4fd" : "transparent",
              }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium truncate" style={{ color: "#333" }}>{c.name}</span>
                <Badge variant={STATUS_VARIANTS[c.status] ?? "default"}>{STATUS_LABELS[c.status] ?? c.status}</Badge>
              </div>
              <p className="text-xs truncate" style={{ color: "#888" }}>Тема: {c.subject}</p>
              <div className="flex gap-3 mt-1 text-xs" style={{ color: "#aaa" }}>
                <span>{c.total_recipients} получателей</span>
                {c.sent_count > 0 && <span style={{ color: "#2e7d32" }}>{c.sent_count} отправлено</span>}
                {c.failed_count > 0 && <span style={{ color: "#c62828" }}>{c.failed_count} ошибок</span>}
              </div>
              <p className="text-xs mt-1" style={{ color: "#ccc" }}>{formatDateTime(c.created_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Campaign detail */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: "#f5f5f5" }}>
        {!selectedCampaign ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Send size={48} style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Выберите рассылку для просмотра</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            {/* Header */}
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-base font-semibold" style={{ color: "#333" }}>{selectedCampaign.name}</h2>
                <Badge variant={STATUS_VARIANTS[selectedCampaign.status] ?? "default"}>
                  {STATUS_LABELS[selectedCampaign.status]}
                </Badge>
              </div>
              <p className="text-xs" style={{ color: "#888" }}>Тема: <strong>{selectedCampaign.subject}</strong></p>
              {selectedCampaign.sent_at && (
                <p className="text-xs mt-1" style={{ color: "#888" }}>Отправлена: {formatDateTime(selectedCampaign.sent_at)}</p>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: "Всего", value: selectedCampaign.total_recipients, icon: Mail, color: "#0067a5", bg: "#e8f4fd" },
                { label: "Отправлено", value: sentRecipients.length, icon: CheckCircle, color: "#2e7d32", bg: "#e8f5e9" },
                { label: "Ошибки", value: failedRecipients.length, icon: XCircle, color: "#c62828", bg: "#fdecea" },
                { label: "Ожидают", value: pendingRecipients.length, icon: Clock, color: "#e65c00", bg: "#fff3e0" },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="rounded p-3" style={{ background: s.bg, border: `1px solid ${s.color}20` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={14} style={{ color: s.color }} />
                      <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>
                    </div>
                    <span className="text-lg font-bold" style={{ color: s.color }}>{s.value}</span>
                  </div>
                );
              })}
            </div>

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
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "#888" }}>Статус</th>
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
