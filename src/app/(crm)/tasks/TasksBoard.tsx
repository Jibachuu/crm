"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Filter } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import CreateTaskModal from "@/components/ui/CreateTaskModal";
import EditTaskModal from "@/components/ui/EditTaskModal";
import { formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import Link from "next/link";

const PRIORITY_VARIANTS: Record<string, "danger" | "warning" | "default"> = {
  high: "danger", medium: "warning", low: "default",
};
const PRIORITY_LABELS: Record<string, string> = {
  high: "Высокий", medium: "Средний", low: "Низкий",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает", in_progress: "В работе", done: "Выполнена",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  done: "bg-green-50 text-green-700 border-green-200",
};
const ENTITY_LINKS: Record<string, string> = {
  lead: "/leads", deal: "/deals", contact: "/contacts", company: "/companies",
};
const ENTITY_LABELS: Record<string, string> = {
  lead: "Лид", deal: "Сделка", contact: "Контакт", company: "Компания",
};

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  due_date?: string;
  created_at?: string;
  entity_type?: string;
  entity_id?: string;
  users?: { full_name: string };
  creator?: { full_name: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function TasksBoard({ initialTasks, entityIndex = {} }: { initialTasks: any[]; entityIndex?: Record<string, Record<string, string>> }) {
  const { user: currentUser, isManager } = useCurrentUser();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Удалить выбранные задачи (${ids.length})?`)) return;
    const res = await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert("Не удалось удалить: " + (err.error || res.status));
      return;
    }
    setTasks((p) => p.filter((t) => !selectedIds.has(t.id)));
    setSelectedIds(new Set());
  }
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterUser, setFilterUser] = useState<string>(isManager && currentUser ? currentUser.id : "all");
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);

  useEffect(() => {
    createClient().from("users").select("id, full_name").eq("is_active", true).order("full_name").then(({ data }) => setUsers(data ?? []));
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visibleTasks = filterUser === "all" ? tasks : tasks.filter((t) => (t as any).assigned_to === filterUser);

  const grouped = {
    pending: visibleTasks.filter((t) => t.status === "pending"),
    in_progress: visibleTasks.filter((t) => t.status === "in_progress"),
    done: visibleTasks.filter((t) => t.status === "done"),
  };

  async function changeStatus(id: string, status: string) {
    await createClient().from("tasks").update({ status }).eq("id", id);
    setTasks((p) => p.map((t) => t.id === id ? { ...t, status } : t));
  }

  async function deleteTask(id: string) {
    if (!confirm("Удалить задачу?")) return;
    setDeletingId(id);
    const res = await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert("Не удалось удалить: " + (err.error || res.status));
      setDeletingId(null);
      return;
    }
    setTasks((p) => p.filter((t) => t.id !== id));
    setDeletingId(null);
  }

  const NEXT_STATUS: Record<string, string> = {
    pending: "in_progress",
    in_progress: "done",
    done: "pending",
  };
  const NEXT_LABEL: Record<string, string> = {
    pending: "→ В работу",
    in_progress: "→ Выполнена",
    done: "→ Заново",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">Все сотрудники</option>
            {currentUser && <option value={currentUser.id}>Мои задачи</option>}
            {users.filter((u) => u.id !== currentUser?.id).map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
          <span className="text-xs text-slate-400">{visibleTasks.length} задач</span>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Новая задача
        </Button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2 rounded-lg bg-red-50 border border-red-200">
          <span className="text-sm font-medium text-red-700">Выбрано: {selectedIds.size}</span>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-600 hover:underline">Снять</button>
          <div className="flex-1" />
          <Button size="sm" variant="danger" onClick={bulkDelete}>
            <Trash2 size={13} /> Удалить выбранные
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {(["pending", "in_progress", "done"] as const).map((status) => (
          <div key={status}>
            <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border ${STATUS_COLORS[status]}`}>
              <h3 className="font-semibold text-sm">{STATUS_LABELS[status]}</h3>
              <span className="text-xs bg-white/60 px-2 py-0.5 rounded-full font-medium">
                {grouped[status].length}
              </span>
            </div>
            <div className="space-y-2">
              {grouped[status].map((task) => (
                <Card key={task.id}>
                  <CardBody className="py-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(task.id)}
                          onChange={() => toggleSelect(task.id)}
                          className="mt-0.5 cursor-pointer"
                        />
                        <p className="text-sm font-medium text-slate-900 leading-snug">{task.title}</p>
                      </div>
                      <Badge variant={PRIORITY_VARIANTS[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
                    </div>
                    {task.description && (
                      <p className="text-xs text-slate-500 mb-2 line-clamp-2">{task.description}</p>
                    )}
                    {task.entity_type && task.entity_id && (() => {
                      const title = entityIndex[task.entity_type]?.[task.entity_id];
                      const label = `${ENTITY_LABELS[task.entity_type] ?? task.entity_type}${title ? `: ${title}` : ""}`;
                      // Soft-deleted entity → no link, just a strikethrough label.
                      if (!title) {
                        return <span className="text-xs text-slate-400 mb-2 block line-through">{ENTITY_LABELS[task.entity_type] ?? task.entity_type} (удалена)</span>;
                      }
                      return (
                        <Link
                          href={`${ENTITY_LINKS[task.entity_type]}/${task.entity_id}`}
                          className="text-xs text-blue-600 hover:underline mb-2 block"
                        >
                          {label}
                        </Link>
                      );
                    })()}
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      {task.due_date && (
                        <span className={`text-xs ${new Date(task.due_date) < new Date() && task.status !== "done" ? "text-red-500 font-medium" : "text-slate-400"}`}>
                          до {formatDate(task.due_date)}
                        </span>
                      )}
                      {task.users && <span className="text-xs text-slate-400">• {task.users.full_name}</span>}
                    </div>
                    <div className="flex items-center gap-3 mb-3 flex-wrap text-xs text-slate-400">
                      {task.created_at && <span>создана {formatDate(task.created_at)}</span>}
                      {task.creator && <span>• поставил(а): {task.creator.full_name}</span>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => changeStatus(task.id, NEXT_STATUS[task.status])}
                        className="flex-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1 transition-colors"
                      >
                        {NEXT_LABEL[task.status]}
                      </button>
                      <button
                        onClick={() => setEditingTask(task)}
                        className="text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded px-2 py-1 transition-colors"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => deleteTask(task.id)}
                        disabled={deletingId === task.id}
                        className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded px-2 py-1 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </CardBody>
                </Card>
              ))}
              {grouped[status].length === 0 && (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-4 text-center text-sm text-slate-400">
                  Нет задач
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <CreateTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        entityType="lead"
        entityId=""
        onCreated={(task) => setTasks((p) => [task, ...p])}
      />
      <EditTaskModal
        open={editingTask !== null}
        onClose={() => setEditingTask(null)}
        task={editingTask}
        onSaved={(updated) => setTasks((p) => p.map((t) => t.id === updated.id ? updated : t))}
      />
    </div>
  );
}
