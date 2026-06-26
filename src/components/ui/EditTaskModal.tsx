"use client";

import { useState, useEffect } from "react";
import Modal from "./Modal";
import Input from "./Input";
import Select from "./Select";
import Textarea from "./Textarea";
import Button from "./Button";
import { createClient } from "@/lib/supabase/client";

const PRIORITY_OPTIONS = [
  { value: "low", label: "Низкий" },
  { value: "medium", label: "Средний" },
  { value: "high", label: "Высокий" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Ожидает" },
  { value: "in_progress", label: "В работе" },
  { value: "done", label: "Выполнена" },
  { value: "cancelled", label: "Отменена" },
];

interface EditTaskModalProps {
  open: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  task: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSaved: (task: any) => void;
}

export default function EditTaskModal({ open, onClose, task, onSaved }: EditTaskModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  // Controlled value для исполнителя — иначе при первом рендере users[]
  // пустой и Select не находит option=task.assigned_to → показывает
  // placeholder, юзеру кажется что исполнитель не назначен. Завязываем
  // на task.assigned_to и сбрасываем при смене task / открытии.
  const [assignedTo, setAssignedTo] = useState<string>(task?.assigned_to ?? "");

  useEffect(() => {
    if (!open) return;
    setAssignedTo(task?.assigned_to ?? "");
    createClient().from("users").select("id, full_name").eq("is_active", true).then(({ data }) => {
      setUsers(data ?? []);
    });
  }, [open, task?.assigned_to]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();

    // ВАЖНО (баг #35 от Рустема, 19.06.2026): assigned_to НЕ отправляем
    // если в поле пустая строка. Раньше отправляли `|| null` → каждый раз
    // когда менеджер редактировал заголовок/дату не трогая исполнителя,
    // assigned_to затиралось в null и задача «терялась» (не показывалась
    // в фильтре «мои задачи»).
    // Корень проблемы: <Select defaultValue={task.assigned_to}> срабатывает
    // на первом рендере когда users[] ещё пустой (грузятся в useEffect),
    // не находит соответствующий option → выбирает placeholder. Юзер не
    // меняет — submit шлёт пустую строку. Не передавая поле, оставляем
    // текущее значение в БД нетронутым. Кому реально надо снять
    // исполнителя — можно будет добавить отдельную кнопку «Снять».
    const updates: Record<string, unknown> = {
      title: fd.get("title") as string,
      description: (fd.get("description") as string) || null,
      priority: (fd.get("priority") as string) || "medium",
      status: (fd.get("status") as string) || "pending",
      due_date: (fd.get("due_date") as string) || null,
    };
    const assignedTo = (fd.get("assigned_to") as string) || "";
    if (assignedTo) updates.assigned_to = assignedTo;

    const { data, error: err } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", task.id)
      .select("*, users!tasks_assigned_to_fkey(full_name)")
      .single();

    if (err) setError(err.message);
    else { onSaved(data); onClose(); }
    setLoading(false);
  }

  if (!task) return null;

  return (
    <Modal open={open} onClose={onClose} title="Редактировать задачу" size="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <Input label="Название задачи" name="title" defaultValue={task.title} required />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Статус" name="status" options={STATUS_OPTIONS} defaultValue={task.status} />
          <Select label="Приоритет" name="priority" options={PRIORITY_OPTIONS} defaultValue={task.priority} />
        </div>
        <Input label="Срок выполнения" name="due_date" type="date" defaultValue={task.due_date?.slice(0, 10) ?? ""} />
        <Select
          label="Исполнитель"
          name="assigned_to"
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          placeholder="Выберите исполнителя"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
        />
        <Textarea label="Описание" name="description" defaultValue={task.description ?? ""} placeholder="Дополнительные детали..." />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>Сохранить</Button>
        </div>
      </form>
    </Modal>
  );
}
