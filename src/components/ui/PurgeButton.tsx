"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

const TABLE_LABELS: Record<string, string> = {
  leads: "все лиды",
  deals: "все сделки",
  contacts: "все контакты",
  companies: "все компании",
  products: "все товары",
};

// Two-stage confirm + typed phrase. Single-click button next to
// "Создать контакт" was too easy to hit — Жиба confirmed unsafe 23.04.
// We now require the operator to type "УДАЛИТЬ" exactly, so a stray
// click can't wipe the table.
const CONFIRM_WORD = "УДАЛИТЬ";

export default function PurgeButton({ table, onPurged }: { table: string; onPurged: () => void }) {
  const [loading, setLoading] = useState(false);

  async function handlePurge() {
    const label = TABLE_LABELS[table] ?? table;
    if (!confirm(`Удалить ${label}?\n\nДЕЙСТВИЕ НЕОБРАТИМО.`)) return;
    const typed = window.prompt(
      `Чтобы удалить ${label} безвозвратно — введите слово ${CONFIRM_WORD} (заглавными буквами).`
    );
    if (typed?.trim() !== CONFIRM_WORD) {
      alert("Подтверждение не введено — операция отменена.");
      return;
    }

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
