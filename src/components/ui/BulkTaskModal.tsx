"use client";

import { useState, useEffect } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { createClient } from "@/lib/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
  entityType: "lead" | "deal" | "contact" | "company";
  entityIds: string[];
  onCreated?: () => void;
}

export default function BulkTaskModal({ open, onClose, entityType, entityIds, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [description, setDescription] = useState("");
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    createClient().from("users").select("id, full_name").eq("is_active", true)
      .then(({ data }) => setUsers(data ?? []));
  }, [open]);

  async function handleCreate() {
    if (!title.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const tasks = entityIds.map((id) => ({
      title: title.trim(),
      priority,
      due_date: dueDate || null,
      assigned_to: assignedTo || null,
      description: description || null,
      entity_type: entityType,
      entity_id: id,
      created_by: user!.id,
      status: "pending",
    }));

    await supabase.from("tasks").insert(tasks);
    setLoading(false);
    onCreated?.();
    onClose();
    setTitle("");
    setPriority("medium");
    setDueDate("");
    setAssignedTo("");
    setDescription("");
  }

  const labelStyle = { color: "#555", fontSize: 12, fontWeight: 500, marginBottom: 4, display: "block" as const };
  const inputStyle = {
    width: "100%", border: "1px solid #d0d0d0", borderRadius: 4,
    padding: "6px 10px", fontSize: 13, outline: "none",
  };

  return (
    <Modal open={open} onClose={onClose} title={`Создать задачу для ${entityIds.length} записей`} size="sm">
      <div className="p-5 space-y-3">
        <div>
          <label style={labelStyle}>Название задачи *</label>
          <input
            autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Что нужно сделать?"
            style={inputStyle}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Приоритет</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>
              <option value="low">Низкий</option>
              <option value="medium">Средний</option>
              <option value="high">Высокий</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Срок</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Ответственный</label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={inputStyle}>
            <option value="">— Не назначен —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Описание</label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            rows={2} placeholder="Дополнительная информация..."
            style={{ ...inputStyle, resize: "none" }}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Отмена</Button>
          <Button size="sm" onClick={handleCreate} loading={loading} disabled={!title.trim()}>
            Создать для {entityIds.length} записей
          </Button>
        </div>
      </div>
    </Modal>
  );
}
