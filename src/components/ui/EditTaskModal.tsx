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

  useEffect(() => {
    if (!open) return;
    createClient().from("users").select("id, full_name").eq("is_active", true).then(({ data }) => {
      setUsers(data ?? []);
    });
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();

    const updates = {
      title: fd.get("title") as string,
      description: (fd.get("description") as string) || null,
      priority: (fd.get("priority") as string) || "medium",
      status: (fd.get("status") as string) || "pending",
      due_date: (fd.get("due_date") as string) || null,
      assigned_to: (fd.get("assigned_to") as string) || null,
    };

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
          defaultValue={task.assigned_to ?? ""}
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
