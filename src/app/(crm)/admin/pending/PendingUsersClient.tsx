"use client";

import { useState } from "react";
import { CheckCircle2, Trash2 } from "lucide-react";

interface PendingUser {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  is_approved: boolean;
  created_at: string;
}

export default function PendingUsersClient({ users: initial }: { users: PendingUser[] }) {
  const [users, setUsers] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function approve(userId: string) {
    if (!confirm("Утвердить этого пользователя? Он получит доступ ко всем данным CRM.")) return;
    setBusy(userId);
    const res = await fetch("/api/admin/approve-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, approved: true }),
    });
    setBusy(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Ошибка утверждения");
      return;
    }
    setUsers(users.filter((u) => u.id !== userId));
  }

  if (users.length === 0) {
    return (
      <div className="bg-white rounded-lg p-12 text-center" style={{ border: "1px solid #e4e4e4" }}>
        <CheckCircle2 size={48} className="mx-auto mb-3 text-green-500" />
        <p className="text-slate-600">Все пользователи утверждены.</p>
        <p className="text-xs text-slate-400 mt-1">
          Новые заявки появятся здесь, когда кто-то создаст аккаунт.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg overflow-hidden" style={{ border: "1px solid #e4e4e4" }}>
      <div className="p-4 border-b border-slate-200 bg-amber-50">
        <p className="text-sm text-amber-900">
          <strong>{users.length}</strong>{" "}
          {users.length === 1 ? "пользователь ожидает" : "пользователей ожидают"} подтверждения.
          Они уже залогинились, но видят только страницу «ожидает подтверждения», без данных CRM.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
            {["Имя", "Email", "Роль", "Создан", ""].map((h) => (
              <th key={h} className="text-left px-4 py-2 text-xs font-semibold uppercase text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td className="px-4 py-3 font-medium text-slate-800">{u.full_name || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{u.email}</td>
              <td className="px-4 py-3 text-slate-500 font-mono text-xs">{u.role}</td>
              <td className="px-4 py-3 text-slate-500 text-xs">
                {new Date(u.created_at).toLocaleDateString("ru-RU")}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => approve(u.id)}
                  disabled={busy === u.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                >
                  <CheckCircle2 size={13} />
                  {busy === u.id ? "..." : "Утвердить"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
