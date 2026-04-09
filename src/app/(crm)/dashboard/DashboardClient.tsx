"use client";

import { useState, useEffect } from "react";
import { Users, Handshake, ContactRound, Building2, TrendingUp, CheckSquare } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import Link from "next/link";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DashboardClient({ leads, deals, contacts, companies, tasks }: { leads: any[]; deals: any[]; contacts: any[]; companies: any[]; tasks: any[] }) {
  const { user: currentUser, isManager } = useCurrentUser();
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);

  function inRange(created_at: string) {
    if (!dateFrom && !dateTo) return true;
    return (!dateFrom || created_at >= dateFrom) && (!dateTo || created_at <= dateTo + "T23:59:59");
  }

  function isOwned(item: { assigned_to?: string }) {
    if (!isManager || !currentUser) return true;
    return item.assigned_to === currentUser.id;
  }

  const fLeads = leads.filter((l) => inRange(l.created_at) && isOwned(l));
  const fDeals = deals.filter((d) => inRange(d.created_at) && isOwned(d));
  const fContacts = contacts.filter((c) => inRange(c.created_at) && isOwned(c));
  const fCompanies = companies.filter((c) => inRange(c.created_at) && isOwned(c));

  const newLeads = fLeads.filter((l) => l.status === "new").length;
  const wonDeals = fDeals.filter((d) => d.stage === "won");
  const totalRevenue = wonDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const ownTasks = isManager && currentUser ? tasks.filter((t) => t.assigned_to === currentUser.id) : tasks;
  const pendingTasks = ownTasks.filter((t) => t.status !== "done" && t.status !== "cancelled").length;

  const statCards = [
    { title: "Лиды", value: fLeads.length, sub: `${newLeads} новых`, icon: Users, color: "text-blue-600", bg: "bg-blue-50", href: "/leads" },
    { title: "Сделки", value: fDeals.length, sub: `${wonDeals.length} выиграно`, icon: Handshake, color: "text-green-600", bg: "bg-green-50", href: "/deals" },
    { title: "Выручка", value: formatCurrency(totalRevenue), sub: "по закрытым сделкам", icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50", href: "/analytics" },
    { title: "Контакты", value: fContacts.length, sub: "в базе", icon: ContactRound, color: "text-orange-600", bg: "bg-orange-50", href: "/contacts" },
    { title: "Компании", value: fCompanies.length, sub: "в базе", icon: Building2, color: "text-cyan-600", bg: "bg-cyan-50", href: "/companies" },
    { title: "Задачи", value: pendingTasks, sub: "активных", icon: CheckSquare, color: "text-red-600", bg: "bg-red-50", href: "/tasks" },
  ];

  // Deal stages summary
  const stageGroups = [
    { slug: "invoice", label: "Счёт выставлен", color: "#1D9E75" },
    { slug: "won", label: "Выиграна / Оплата", color: "#639922" },
    { slug: "kp_sent", label: "КП отправлено", color: "#1D9E75" },
    { slug: "objections", label: "Возражения", color: "#EF9F27" },
    { slug: "price_calc", label: "Просчёт стоимости", color: "#7F77DD" },
    { slug: "lost", label: "Проиграна", color: "#E24B4A" },
  ];

  // Map stage_id to slug (from deals that have funnel stage data)
  // For now use old `stage` field as fallback
  function getDealSlug(d: { stage?: string }) {
    return d.stage ?? "";
  }

  const recentLeads = [...fLeads].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const recentDeals = [...fDeals].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);

  return (
    <div>
      {/* Date filter */}
      <div className="flex items-center gap-3 mb-6">
        <DateRangeFilter onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        {(dateFrom || dateTo) && (
          <span className="text-xs" style={{ color: "#888" }}>
            Показаны данные за {dateFrom ?? "..."} — {dateTo ?? "..."}
          </span>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.title} href={card.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 mb-1">{card.title}</p>
                      <p className="text-2xl font-bold text-slate-900">{card.value}</p>
                      <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.bg}`}>
                      <Icon size={22} className={card.color} />
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Deal stages summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {stageGroups.map((sg) => {
          const stageDeals = fDeals.filter((d) => getDealSlug(d) === sg.slug || d.stage === sg.slug);
          const stageAmount = stageDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
          return (
            <div key={sg.slug} className="rounded-lg p-3" style={{ background: sg.color + "10", border: `1px solid ${sg.color}30` }}>
              <p className="text-xs font-medium mb-1" style={{ color: sg.color }}>{sg.label}</p>
              <p className="text-lg font-bold" style={{ color: "#333" }}>{stageDeals.length}</p>
              <p className="text-xs" style={{ color: "#888" }}>{formatCurrency(stageAmount)}</p>
            </div>
          );
        })}
      </div>

      {/* Recent lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Последние лиды</h3>
            <Link href="/leads" className="text-sm text-blue-600 hover:underline">Все лиды</Link>
          </div>
          <CardBody className="p-0">
            {recentLeads.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Нет лидов</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentLeads.map((lead) => (
                  <li key={lead.id}>
                    <Link href={`/leads/${lead.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{lead.title}</p>
                        <p className="text-xs text-slate-400">{lead.contacts?.full_name ?? "Без контакта"}</p>
                      </div>
                      <span className="text-xs text-slate-400">{formatDate(lead.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Последние сделки</h3>
            <Link href="/deals" className="text-sm text-blue-600 hover:underline">Все сделки</Link>
          </div>
          <CardBody className="p-0">
            {recentDeals.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Нет сделок</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentDeals.map((deal) => (
                  <li key={deal.id}>
                    <Link href={`/deals/${deal.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{deal.title}</p>
                        <p className="text-xs text-slate-400">{formatCurrency(deal.amount)}</p>
                      </div>
                      <span className="text-xs text-slate-400">{formatDate(deal.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
