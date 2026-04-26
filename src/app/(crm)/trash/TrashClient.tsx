"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { apiGet, apiPost } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils";

type Tab = "leads" | "deals" | "contacts" | "companies" | "tasks";
const TABS: { id: Tab; label: string }[] = [
  { id: "leads", label: "Лиды" },
  { id: "deals", label: "Сделки" },
  { id: "contacts", label: "Контакты" },
  { id: "companies", label: "Компании" },
  { id: "tasks", label: "Задачи" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any> & { id: string; deleted_at: string; _actor?: { full_name?: string; deleted_at?: string } | null };

function formatRow(table: Tab, r: Row): { primary: string; secondary?: string } {
  if (table === "leads") return { primary: r.title || "—", secondary: [r.contacts?.full_name, r.companies?.name].filter(Boolean).join(" · ") };
  if (table === "deals") return { primary: r.title || "—", secondary: [r.contacts?.full_name, r.companies?.name].filter(Boolean).join(" · ") };
  if (table === "contacts") return { primary: r.full_name || "—", secondary: [r.phone, r.email, r.companies?.name].filter(Boolean).join(" · ") };
  if (table === "companies") return { primary: r.name || "—", secondary: [r.inn, r.phone].filter(Boolean).join(" · ") };
  return { primary: r.title || "—", secondary: r.due_date ? `до ${formatDateTime(r.due_date)}` : undefined };
}

export default function TrashClient() {
  const [tab, setTab] = useState<Tab>("leads");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    const { data, error } = await apiGet<{ rows: Row[] }>(`/api/trash?table=${t}&days=30`);
    setRows(error || !data ? [] : data.rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  async function restore(id: string) {
    setBusyIds((p) => { const n = new Set(p); n.add(id); return n; });
    const { error } = await apiPost("/api/restore", { table: tab, ids: [id] });
    setBusyIds((p) => { const n = new Set(p); n.delete(id); return n; });
    if (error) { alert("Не удалось восстановить: " + error); return; }
    setRows((p) => p.filter((r) => r.id !== id));
  }

  async function hardDelete(id: string) {
    if (!confirm("Удалить безвозвратно? Это действие нельзя отменить.")) return;
    setBusyIds((p) => { const n = new Set(p); n.add(id); return n; });
    const { error } = await apiPost("/api/delete", { table: tab, ids: [id], force: true });
    setBusyIds((p) => { const n = new Set(p); n.delete(id); return n; });
    if (error) { alert("Не удалось удалить: " + error); return; }
    setRows((p) => p.filter((r) => r.id !== id));
  }

  return (
    <div className="max-w-5xl mx-auto">
      <p className="text-sm mb-4" style={{ color: "#666" }}>
        Удалённые сущности за последние 30 дней. Можно восстановить или удалить безвозвратно (только админ).
      </p>

      <div className="flex gap-1 mb-4 overflow-x-auto" style={{ borderBottom: "1px solid #e4e4e4" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 text-sm font-medium flex-shrink-0"
            style={{
              borderBottom: tab === t.id ? "2px solid #0067a5" : "2px solid transparent",
              color: tab === t.id ? "#0067a5" : "#666",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-center py-12" style={{ color: "#aaa" }}>Загрузка...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: "#aaa" }}>Корзина пуста</p>
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => {
                const f = formatRow(tab, r);
                const busy = busyIds.has(r.id);
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "#333" }}>{f.primary}</p>
                      {f.secondary && <p className="text-xs truncate" style={{ color: "#888" }}>{f.secondary}</p>}
                      <p className="text-xs mt-0.5" style={{ color: "#aaa" }}>
                        Удалено {formatDateTime(r.deleted_at)}
                        {r._actor?.full_name && ` · ${r._actor.full_name}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link href={`/${tab}/${r.id}`} className="text-xs hover:underline" style={{ color: "#0067a5" }}>Открыть</Link>
                      <Button size="sm" variant="secondary" onClick={() => restore(r.id)} loading={busy}>
                        <RotateCcw size={12} /> Восстановить
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => hardDelete(r.id)} loading={busy}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
