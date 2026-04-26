"use client";

import { useState, useEffect } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Save } from "lucide-react";

interface Rule {
  id: string;
  enabled: boolean;
  days_offset: number;
  priority: string;
  description: string;
}

const PRIORITY_OPTIONS = [
  { value: "low", label: "Низкий" },
  { value: "medium", label: "Средний" },
  { value: "high", label: "Высокий" },
];

// Friendly labels for rule ids — keys must match seed in migration_v70.sql.
const RULE_LABELS: Record<string, string> = {
  "production.assigned": "Новый заказ передан в работу",
  "production.shipped": "Заказ отгружен (трек добавлен)",
  "production.delivered_review": "Запрос отзыва после доставки",
};

export default function TaskAutomationSettings() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/task-automations");
    const data = await res.json();
    setRules(data.rows ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save(r: Rule) {
    setSaving(r.id);
    await fetch("/api/admin/task-automations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, enabled: r.enabled, days_offset: r.days_offset, priority: r.priority }),
    });
    setSaving(null);
  }

  function update(id: string, patch: Partial<Rule>) {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  if (loading) return <p className="text-sm text-center py-8" style={{ color: "#aaa" }}>Загрузка…</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1" style={{ color: "#222" }}>Автозадачи</h2>
      <p className="text-sm mb-4" style={{ color: "#888" }}>
        CRM сама создаёт задачи на ключевые события производства. Здесь можно отключить или сдвинуть срок.
      </p>
      <div className="space-y-3">
        {rules.map((r) => (
          <Card key={r.id}>
            <CardBody>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => update(r.id, { enabled: e.target.checked })}
                      style={{ accentColor: "#0067a5", width: 16, height: 16 }}
                    />
                    <span className="text-sm font-semibold" style={{ color: "#333" }}>{RULE_LABELS[r.id] ?? r.id}</span>
                  </div>
                  <p className="text-xs ml-6" style={{ color: "#888" }}>{r.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  {r.id === "production.delivered_review" && (
                    <label className="flex items-center gap-1 text-xs" style={{ color: "#666" }}>
                      Через
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={r.days_offset}
                        onChange={(e) => update(r.id, { days_offset: Number(e.target.value) })}
                        className="w-14 text-sm px-2 py-1 rounded text-center"
                        style={{ border: "1px solid #d0d0d0" }}
                      />
                      дней
                    </label>
                  )}
                  <select
                    value={r.priority}
                    onChange={(e) => update(r.id, { priority: e.target.value })}
                    className="text-xs px-2 py-1 rounded"
                    style={{ border: "1px solid #d0d0d0" }}
                  >
                    {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <button
                    onClick={() => save(r)}
                    disabled={saving === r.id}
                    className="text-xs px-3 py-1.5 rounded text-white disabled:opacity-50"
                    style={{ background: "#0067a5" }}
                  >
                    <Save size={11} className="inline" /> {saving === r.id ? "..." : "Сохранить"}
                  </button>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
