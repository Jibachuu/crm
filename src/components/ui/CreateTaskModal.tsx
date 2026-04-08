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

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  entityType: "lead" | "deal" | "contact" | "company";
  entityId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onCreated: (task: any) => void;
}

export default function CreateTaskModal({ open, onClose, entityType, entityId, onCreated }: CreateTaskModalProps) {
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
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error: err } = await supabase
      .from("tasks")
      .insert({
        title: fd.get("title") as string,
        description: (fd.get("description") as string) || null,
        priority: (fd.get("priority") as string) || "medium",
        due_date: (fd.get("due_date") as string) || null,
        assigned_to: (fd.get("assigned_to") as string) || null,
        entity_type: entityType,
        entity_id: entityId || null,
        status: "pending",
        created_by: user?.id ?? null,
      })
      .select("*, users!tasks_assigned_to_fkey(full_name)")
      .single();

    if (err) setError(err.message);
    else { onCreated(data); onClose(); }
    setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Новая задача" size="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <Input label="Название задачи" name="title" placeholder="Что нужно сделать?" required />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Приоритет" name="priority" options={PRIORITY_OPTIONS} defaultValue="medium" />
          <Input label="Срок выполнения" name="due_date" type="date" />
        </div>
        <Select
          label="Исполнитель"
          name="assigned_to"
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          placeholder="Выберите исполнителя"
        />
        <Textarea label="Описание" name="description" placeholder="Дополнительные детали..." />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>Создать задачу</Button>
        </div>
      </form>
    </Modal>
  );
}
