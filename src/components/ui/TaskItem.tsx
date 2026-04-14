"use client";

import { useState } from "react";
import { CheckSquare, Edit2, Trash2, Check, X } from "lucide-react";
import Badge from "./Badge";
import { Card, CardBody } from "./Card";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date?: string;
  users?: { full_name: string };
}

const PRIORITY_LABELS: Record<string, string> = { low: "Низкий", medium: "Средний", high: "Высокий" };
const STATUS_LABELS: Record<string, string> = { pending: "Ожидает", in_progress: "В работе", done: "Выполнена" };

function formatDate(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function TaskItem({ task, onUpdated, onDeleted }: { task: Task; onUpdated: (t: Task) => void; onDeleted: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [dueDate, setDueDate] = useState(task.due_date?.slice(0, 10) ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, title, priority, status, due_date: dueDate || null }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdated(data);
        setEditing(false);
      } else {
        const d = await res.json();
        alert("Ошибка: " + (d.error || ""));
      }
    } catch (e) { alert(String(e)); }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Удалить задачу?")) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id }),
      });
      if (res.ok) onDeleted(task.id);
      else alert("Ошибка удаления");
    } catch (e) { alert(String(e)); }
  }

  async function toggleComplete() {
    const newStatus = task.status === "done" ? "pending" : "done";
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, status: newStatus }),
    });
    if (res.ok) {
      const data = await res.json();
      onUpdated(data);
    }
  }

  if (editing) {
    return (
      <Card>
        <CardBody className="py-3 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full text-sm px-2 py-1.5 rounded focus:outline-none"
            style={{ border: "1px solid #d0d0d0" }} />
          <div className="flex gap-2">
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className="text-xs px-2 py-1 rounded" style={{ border: "1px solid #d0d0d0" }}>
              <option value="low">Низкий</option>
              <option value="medium">Средний</option>
              <option value="high">Высокий</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="text-xs px-2 py-1 rounded" style={{ border: "1px solid #d0d0d0" }}>
              <option value="pending">Ожидает</option>
              <option value="in_progress">В работе</option>
              <option value="done">Выполнена</option>
            </select>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="text-xs px-2 py-1 rounded" style={{ border: "1px solid #d0d0d0" }} />
          </div>
          <div className="flex justify-end gap-1">
            <button onClick={() => setEditing(false)} className="p-1 rounded hover:bg-gray-100"><X size={14} style={{ color: "#888" }} /></button>
            <button onClick={handleSave} disabled={saving} className="p-1 rounded hover:bg-blue-50"><Check size={14} style={{ color: "#0067a5" }} /></button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="py-3">
        <div className="flex items-center gap-3">
          <button onClick={toggleComplete} title={task.status === "done" ? "Вернуть в работу" : "Завершить"}>
            <CheckSquare size={15} style={{ color: task.status === "done" ? "#2e7d32" : "#aaa", flexShrink: 0 }} />
          </button>
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: task.status === "done" ? "#aaa" : "#333", textDecoration: task.status === "done" ? "line-through" : "none" }}>{task.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {task.due_date && <span className="text-xs" style={{ color: "#999" }}>до {formatDate(task.due_date)}</span>}
              {task.users && <span className="text-xs" style={{ color: "#999" }}>• {task.users.full_name}</span>}
              <span className="text-xs" style={{ color: "#bbb" }}>{STATUS_LABELS[task.status] ?? task.status}</span>
            </div>
          </div>
          <Badge variant={task.priority === "high" ? "danger" : task.priority === "medium" ? "warning" : "default"}>
            {PRIORITY_LABELS[task.priority]}
          </Badge>
          <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-blue-50" title="Редактировать">
            <Edit2 size={13} style={{ color: "#0067a5" }} />
          </button>
          <button onClick={handleDelete} className="p-1 rounded hover:bg-red-50" title="Удалить">
            <Trash2 size={13} style={{ color: "#c62828" }} />
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
