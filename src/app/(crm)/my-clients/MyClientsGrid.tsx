"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Building2, Clock, CheckSquare, FileText, UserCircle, Phone } from "lucide-react";
import Badge from "@/components/ui/Badge";
import ClientTimeIndicator from "@/components/ui/ClientTimeIndicator";
import { formatCurrency } from "@/lib/utils";

const CONTRACT_LABELS: Record<string, string> = { none: "Нет договора", pending: "Согласование", signed: "Подписан", terminated: "Расторгнут" };
const CONTRACT_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = { none: "danger", pending: "warning", signed: "success", terminated: "default" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function MyClientsGrid({ companies, users, currentUserId, isAdmin }: any) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "sleeping" | "no_contract">("all");
  const [managerFilter, setManagerFilter] = useState("");
  const [sort, setSort] = useState<"activity" | "ltv" | "name">("activity");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = companies.filter((c: any) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (managerFilter && c.assigned_to !== managerFilter) return false;
    if (filter === "active" && c.activeTasks === 0) return false;
    if (filter === "sleeping" && c.lastActivity && c.lastActivity > thirtyDaysAgo) return false;
    if (filter === "no_contract" && c.contract_status !== "none") return false;
    return true;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filtered.sort((a: any, b: any) => {
    if (sort === "ltv") return b.ltv - a.ltv;
    if (sort === "name") return a.name.localeCompare(b.name);
    // activity: most recent first
    return (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "");
  });

  function daysAgo(date: string | null) {
    if (!date) return "нет данных";
    const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
    if (d === 0) return "сегодня";
    if (d === 1) return "вчера";
    return `${d} дн. назад`;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по компании..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        <div className="flex gap-1">
          {([
            { key: "all", label: "Все" },
            { key: "active", label: "Активные" },
            { key: "sleeping", label: "Спящие" },
            { key: "no_contract", label: "Без договора" },
          ] as const).map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className="text-xs px-3 py-1.5 rounded transition-colors"
              style={{ background: filter === f.key ? "#0067a5" : "#f0f0f0", color: filter === f.key ? "#fff" : "#666" }}>
              {f.label}
            </button>
          ))}
        </div>
        {isAdmin && (
          <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}
            className="text-xs px-2 py-1.5 rounded outline-none" style={{ border: "1px solid #d0d0d0" }}>
            <option value="">Все менеджеры</option>
            {users.map((u: { id: string; full_name: string }) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
          className="text-xs px-2 py-1.5 rounded outline-none" style={{ border: "1px solid #d0d0d0" }}>
          <option value="activity">По активности</option>
          <option value="ltv">По LTV</option>
          <option value="name">По алфавиту</option>
        </select>
      </div>

      <p className="text-xs mb-3" style={{ color: "#888" }}>Клиентов: <strong>{filtered.length}</strong></p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {filtered.map((c: any) => {
          const isContact = c.clientType === "contact";
          const href = isContact ? `/contacts/${c.id}` : `/my-clients/${c.id}`;
          return (
          <Link key={`${c.clientType}_${c.id}`} href={href}
            className="block rounded-lg p-4 transition-shadow hover:shadow-md"
            style={{ border: `1px solid ${isContact ? "#ffe0b2" : "#e4e4e4"}`, background: "#fff" }}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                {isContact ? <UserCircle size={14} style={{ color: "#e65c00" }} /> : <Building2 size={14} style={{ color: "#0067a5" }} />}
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "#333" }}>{c.name}</h3>
                  {isContact && c.phone && <p className="text-xs" style={{ color: "#888" }}>{c.phone}</p>}
                  {!isContact && c.company_type && <p className="text-xs" style={{ color: "#888" }}>{c.company_type}</p>}
                </div>
              </div>
              <ClientTimeIndicator timezone={c.timezone} region={c.city || c.region} />
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span style={{ color: "#888" }}>Последний контакт</span>
                <span style={{ color: c.lastActivity && c.lastActivity < thirtyDaysAgo ? "#c62828" : "#333" }}>{daysAgo(c.lastActivity)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "#888" }}>LTV</span>
                <span style={{ color: "#2e7d32", fontWeight: 600 }}>{c.ltv > 0 ? formatCurrency(c.ltv) : "—"}</span>
              </div>
              {!isContact && (
                <div className="flex justify-between">
                  <span style={{ color: "#888" }}>Договор</span>
                  <Badge variant={CONTRACT_VARIANTS[c.contract_status ?? "none"] ?? "default"}>
                    {CONTRACT_LABELS[c.contract_status ?? "none"]}
                  </Badge>
                </div>
              )}
              {c.activeTasks > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: "#888" }}>Активных задач</span>
                  <span className="flex items-center gap-1" style={{ color: "#0067a5" }}><CheckSquare size={10} /> {c.activeTasks}</span>
                </div>
              )}
              {!isContact && c.users && (
                <div className="flex justify-between">
                  <span style={{ color: "#888" }}>Менеджер</span>
                  <span style={{ color: "#666" }}>{c.users.full_name}</span>
                </div>
              )}
              {isContact && (
                <div className="flex justify-between">
                  <span style={{ color: "#e65c00", fontSize: 10 }}>Контакт без компании</span>
                </div>
              )}
            </div>
          </Link>
          );
        })}
      </div>
    </div>
  );
}
