"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, Mail, MessageSquare, CheckSquare, FileText, Plus, ChevronLeft } from "lucide-react";
import Badge from "@/components/ui/Badge";
import ClientTimeIndicator from "@/components/ui/ClientTimeIndicator";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = { lead: "Лид", proposal: "КП", negotiation: "Переговоры", order_assembly: "Сборка", won: "Выиграна", lost: "Проиграна" };
const LEAD_STATUS: Record<string, string> = { new: "Новый", callback: "Перезвонить", in_progress: "В работе", samples: "Пробники", samples_shipped: "Пробники отгружены", invoice: "Счёт", rejected: "Отказ", converted: "Конвертирован" };
const SAMPLE_STATUS: Record<string, string> = { new: "Новый", sent: "Отправлен", in_transit: "В пути", delivered: "Доставлен", refused: "Отказ" };
const CHANNEL_LABELS: Record<string, string> = { email: "Email", telegram: "Telegram", phone: "Звонок", maks: "МАКС", note: "Заметка" };

const CONTRACT_LABELS: Record<string, string> = { none: "Нет договора", pending: "Согласование", signed: "Подписан", terminated: "Расторгнут" };
const CONTRACT_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = { none: "danger", pending: "warning", signed: "success", terminated: "default" };

interface TimelineEvent { date: string; type: string; id: string; title: string; subtitle?: string; color: string; link?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CompanyTimeline({ company, contacts, deals, leads, samples, communications, tasks, ltv, avgCheck, topProducts }: any) {
  const [filter, setFilter] = useState("all");
  const [showCount, setShowCount] = useState(20);

  // Build unified timeline
  const events: TimelineEvent[] = [];

  for (const d of deals) {
    events.push({
      date: d.created_at, type: "deal", id: d.id,
      title: d.title,
      subtitle: `${STAGE_LABELS[d.stage] ?? d.stage} · ${d.amount ? formatCurrency(d.amount) : "—"}`,
      color: d.stage === "won" ? "#2e7d32" : d.stage === "lost" ? "#c62828" : "#0067a5",
      link: `/deals/${d.id}`,
    });
  }
  for (const l of leads) {
    events.push({
      date: l.created_at, type: "lead", id: l.id,
      title: l.title,
      subtitle: `${LEAD_STATUS[l.status] ?? l.status}${l.source ? " · " + l.source : ""}`,
      color: "#e65c00", link: `/leads/${l.id}`,
    });
  }
  for (const s of samples) {
    events.push({
      date: s.created_at, type: "sample", id: s.id,
      title: `Пробник`,
      subtitle: `${SAMPLE_STATUS[s.status] ?? s.status}${s.track_number ? " · " + s.track_number : ""}`,
      color: "#7b1fa2",
    });
  }
  for (const c of communications) {
    events.push({
      date: c.created_at, type: "comm", id: c.id,
      title: `${CHANNEL_LABELS[c.channel] ?? c.channel} · ${c.direction === "inbound" ? "←" : "→"}`,
      subtitle: (c.body ?? "").slice(0, 100),
      color: "#888",
    });
  }
  for (const t of tasks) {
    events.push({
      date: t.created_at, type: "task", id: t.id,
      title: t.title,
      subtitle: t.status === "done" ? "✓ Выполнена" : t.due_date ? `До ${formatDate(t.due_date)}` : "",
      color: t.status === "done" ? "#2e7d32" : "#0067a5",
    });
  }

  // Sort newest first
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredEvents = events.filter((e) => filter === "all" || e.type === filter);
  const visible = filteredEvents.slice(0, showCount);

  const lastPurchase = deals.find((d: { stage: string }) => d.stage === "won");

  return (
    <div>
      <Link href="/my-clients" className="flex items-center gap-1 text-sm mb-4 hover:underline" style={{ color: "#0067a5" }}>
        <ChevronLeft size={14} /> Все клиенты
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Timeline */}
        <div className="lg:col-span-2 space-y-3">
          {/* Filters */}
          <div className="flex gap-1 flex-wrap">
            {[
              { key: "all", label: "Все" },
              { key: "deal", label: "Сделки" },
              { key: "lead", label: "Лиды" },
              { key: "comm", label: "Переписки" },
              { key: "task", label: "Задачи" },
              { key: "sample", label: "Пробники" },
            ].map((f) => (
              <button key={f.key} onClick={() => { setFilter(f.key); setShowCount(20); }}
                className="text-xs px-2.5 py-1 rounded transition-colors"
                style={{ background: filter === f.key ? "#0067a5" : "#f0f0f0", color: filter === f.key ? "#fff" : "#666" }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Events */}
          <div className="space-y-2">
            {visible.map((event) => (
              <div key={`${event.type}-${event.id}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ background: event.color }} />
                  <div className="w-px flex-1" style={{ background: "#e4e4e4" }} />
                </div>
                <div className="flex-1 pb-3">
                  {event.link ? (
                    <Link href={event.link} className="block rounded p-3 hover:bg-gray-50 transition-colors" style={{ border: "1px solid #f0f0f0" }}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium" style={{ color: "#333" }}>{event.title}</p>
                        <span className="text-xs" style={{ color: "#aaa" }}>{formatDateTime(event.date)}</span>
                      </div>
                      {event.subtitle && <p className="text-xs mt-0.5" style={{ color: "#888" }}>{event.subtitle}</p>}
                    </Link>
                  ) : (
                    <div className="rounded p-3" style={{ border: "1px solid #f0f0f0" }}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium" style={{ color: "#333" }}>{event.title}</p>
                        <span className="text-xs" style={{ color: "#aaa" }}>{formatDateTime(event.date)}</span>
                      </div>
                      {event.subtitle && <p className="text-xs mt-0.5" style={{ color: "#888" }}>{event.subtitle}</p>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredEvents.length > showCount && (
            <button onClick={() => setShowCount((p) => p + 20)}
              className="w-full text-xs py-2 rounded hover:bg-gray-50" style={{ border: "1px solid #e4e4e4", color: "#0067a5" }}>
              Загрузить ещё ({filteredEvents.length - showCount} осталось)
            </button>
          )}
        </div>

        {/* Right: Summary */}
        <div className="space-y-4">
          {/* Company */}
          <div className="rounded-lg p-4" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "#333" }}>{company.name}</h3>
            {company.company_type && <p className="text-xs" style={{ color: "#888" }}>{company.company_type}</p>}
            <div className="mt-2">
              <ClientTimeIndicator timezone={company.timezone} region={company.city || company.region} />
            </div>
            <div className="mt-2">
              <Badge variant={CONTRACT_VARIANTS[company.contract_status ?? "none"]}>
                {CONTRACT_LABELS[company.contract_status ?? "none"]}
              </Badge>
            </div>
          </div>

          {/* Contacts */}
          <div className="rounded-lg p-4" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
            <h3 className="text-xs font-semibold uppercase mb-2" style={{ color: "#888" }}>Контакты</h3>
            {contacts.length === 0 ? <p className="text-xs" style={{ color: "#aaa" }}>Нет контактов</p> : (
              <div className="space-y-2">
                {contacts.map((c: { id: string; full_name: string; phone?: string; email?: string; telegram_id?: string }) => (
                  <div key={c.id} className="text-xs">
                    <Link href={`/contacts/${c.id}`} className="font-medium hover:underline" style={{ color: "#0067a5" }}>{c.full_name}</Link>
                    <div className="flex gap-2 mt-0.5">
                      {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-0.5" style={{ color: "#666" }}><Phone size={10} /> {c.phone}</a>}
                      {c.telegram_id && <span className="flex items-center gap-0.5" style={{ color: "#0088cc" }}><MessageSquare size={10} /> TG</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Finances */}
          <div className="rounded-lg p-4" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
            <h3 className="text-xs font-semibold uppercase mb-2" style={{ color: "#888" }}>Финансы</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span style={{ color: "#888" }}>LTV</span><span style={{ color: "#2e7d32", fontWeight: 600 }}>{formatCurrency(ltv)}</span></div>
              <div className="flex justify-between"><span style={{ color: "#888" }}>Средний чек</span><span>{formatCurrency(avgCheck)}</span></div>
              {lastPurchase && (
                <div className="flex justify-between"><span style={{ color: "#888" }}>Последняя покупка</span><span>{formatDate(lastPurchase.created_at)}</span></div>
              )}
            </div>
          </div>

          {/* Top products */}
          {topProducts.length > 0 && (
            <div className="rounded-lg p-4" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
              <h3 className="text-xs font-semibold uppercase mb-2" style={{ color: "#888" }}>Топ товаров</h3>
              <div className="space-y-1.5 text-xs">
                {topProducts.map((p: { name: string; qty: number; total: number }, i: number) => (
                  <div key={i} className="flex justify-between">
                    <span style={{ color: "#333" }}>{p.name} ({p.qty} шт.)</span>
                    <span style={{ color: "#2e7d32" }}>{formatCurrency(p.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <Link href={`/leads?company_id=${company.id}`} className="flex items-center gap-2 text-xs px-3 py-2 rounded hover:bg-blue-50 w-full" style={{ border: "1px solid #0067a5", color: "#0067a5" }}>
              <Plus size={12} /> Новый лид
            </Link>
            <Link href={`/deals?company_id=${company.id}`} className="flex items-center gap-2 text-xs px-3 py-2 rounded hover:bg-blue-50 w-full" style={{ border: "1px solid #0067a5", color: "#0067a5" }}>
              <Plus size={12} /> Новая сделка
            </Link>
            <Link href={`/companies/${company.id}`} className="flex items-center gap-2 text-xs px-3 py-2 rounded hover:bg-gray-50 w-full" style={{ border: "1px solid #e4e4e4", color: "#666" }}>
              <FileText size={12} /> Карточка компании
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
