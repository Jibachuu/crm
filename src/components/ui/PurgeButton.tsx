"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

const TABLE_LABELS: Record<string, string> = {
  leads: "все лиды",
  deals: "все сделки",
  contacts: "все контакты",
  companies: "все компании",
};

export default function PurgeButton({ table, onPurged }: { table: string; onPurged: () => void }) {
  const [loading, setLoading] = useState(false);

  async function handlePurge() {
    const label = TABLE_LABELS[table] ?? table;
    if (!confirm(`Вы уверены что хотите удалить ${label}?\n\nЭто действие НЕЛЬЗЯ отменить!`)) return;
    if (!confirm(`Точно удалить ${label}? Это последнее предупреждение.`)) return;

    setLoading(true);
    const res = await fetch("/api/purge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table }),
    });
    if (res.ok) {
      onPurged();
    } else {
      const d = await res.json();
      alert("Ошибка: " + (d.error ?? ""));
    }
    setLoading(false);
  }

  return (
    <button
      onClick={handlePurge}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded transition-all hover:bg-red-50 disabled:opacity-50"
      style={{ border: "1px solid #ffcdd2", color: "#c62828" }}
      title={`Удалить ${TABLE_LABELS[table]}`}
    >
      <Trash2 size={11} />
      {loading ? "Удаление..." : "Очистить всё"}
    </button>
  );
}
