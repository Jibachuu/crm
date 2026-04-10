"use client";

import { useState } from "react";
import { Users, Check } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";

interface User {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  is_active: boolean;
  auto_lead_assignee?: boolean;
  last_auto_lead_at?: string | null;
}

export default function AutoLeadAssignmentSettings({ users: initialUsers }: { users: User[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function toggle(userId: string, current: boolean) {
    setSavingId(userId);
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ auto_lead_assignee: !current })
      .eq("id", userId);
    if (!error) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, auto_lead_assignee: !current } : u))
      );
    } else {
      alert("Ошибка: " + error.message);
    }
    setSavingId(null);
  }

  const enabled = users.filter((u) => u.auto_lead_assignee && u.is_active);

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 mb-2">
          <Users size={16} style={{ color: "#0067a5" }} />
          <h3 className="text-sm font-semibold" style={{ color: "#333" }}>Распределение авто-лидов</h3>
        </div>
        <p className="text-xs mb-4" style={{ color: "#888" }}>
          Лиды, которые приходят сами (Telegram, МАКС, почта, инбокс), будут распределяться по очереди (round-robin) между выбранными сотрудниками. Если выбраны двое — каждому достанется ~50%.
        </p>
        {enabled.length === 0 && (
          <div className="text-xs mb-3 p-2 rounded" style={{ background: "#fff3e0", color: "#bf7600" }}>
            ⚠ Никто не выбран — авто-лиды создаются без ответственного.
          </div>
        )}
        <div className="space-y-1">
          {users.filter((u) => u.is_active).map((u) => {
            const isOn = !!u.auto_lead_assignee;
            return (
              <button
                key={u.id}
                onClick={() => toggle(u.id, isOn)}
                disabled={savingId === u.id}
                className="w-full flex items-center justify-between px-3 py-2 rounded transition-colors hover:bg-gray-50"
                style={{ border: "1px solid #e4e4e4", background: isOn ? "#e8f4fd" : "#fff" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                    style={{ background: isOn ? "#0067a5" : "#f0f0f0", border: isOn ? "1px solid #0067a5" : "1px solid #d0d0d0" }}
                  >
                    {isOn && <Check size={12} style={{ color: "#fff" }} />}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium" style={{ color: "#333" }}>{u.full_name ?? u.email}</p>
                    <p className="text-xs" style={{ color: "#888" }}>{u.email} · {u.role}</p>
                  </div>
                </div>
                {u.last_auto_lead_at && (
                  <span className="text-xs" style={{ color: "#aaa" }}>
                    Последний: {new Date(u.last_auto_lead_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {enabled.length > 0 && (
          <p className="text-xs mt-3" style={{ color: "#2e7d32" }}>
            ✓ Активно: {enabled.length} {enabled.length === 1 ? "сотрудник" : "сотрудников"} в очереди
          </p>
        )}
      </CardBody>
    </Card>
  );
}
