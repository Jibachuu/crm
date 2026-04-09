"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function BulkTransferSettings({ users }: { users: any[] }) {
  const [fromUser, setFromUser] = useState("");
  const [toUser, setToUser] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ companies: number; contacts: number; leads: number; deals: number; tasks: number } | null>(null);

  async function handleTransfer() {
    if (!fromUser || !toUser || fromUser === toUser) return;
    const fromName = users.find((u) => u.id === fromUser)?.full_name ?? "";
    const toName = users.find((u) => u.id === toUser)?.full_name ?? "";
    if (!confirm(`Передать все сущности от "${fromName}" → "${toName}"? Это затронет все компании, контакты, лиды, сделки и задачи.`)) return;

    setLoading(true);
    setResult(null);
    const res = await fetch("/api/responsible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_transfer", from_user_id: fromUser, to_user_id: toUser }),
    });
    const data = await res.json();
    if (data.ok) setResult(data.transferred);
    else alert("Ошибка: " + (data.error ?? ""));
    setLoading(false);
  }

  return (
    <Card>
      <CardBody>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "#333" }}>Передача ответственного</h3>
        <p className="text-xs mb-4" style={{ color: "#888" }}>
          Перенести все компании, контакты, лиды, сделки и задачи от одного менеджера к другому
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">От кого</label>
            <select
              value={fromUser}
              onChange={(e) => setFromUser(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm border-slate-300 bg-white"
            >
              <option value="">Выберите...</option>
              {users.filter((u) => u.is_active).map((u) => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
              ))}
            </select>
          </div>
          <ArrowRight size={18} style={{ color: "#aaa", marginBottom: 8 }} />
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Кому</label>
            <select
              value={toUser}
              onChange={(e) => setToUser(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm border-slate-300 bg-white"
            >
              <option value="">Выберите...</option>
              {users.filter((u) => u.is_active && u.id !== fromUser).map((u) => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
              ))}
            </select>
          </div>
          <Button onClick={handleTransfer} loading={loading} disabled={!fromUser || !toUser || fromUser === toUser}>
            Передать
          </Button>
        </div>
        {result && (
          <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: "#e8f5e9", color: "#2e7d32" }}>
            Передано: {result.companies} компаний, {result.contacts} контактов, {result.leads} лидов, {result.deals} сделок, {result.tasks} задач
          </div>
        )}
      </CardBody>
    </Card>
  );
}
