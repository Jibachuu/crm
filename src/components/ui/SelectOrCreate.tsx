"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import Button from "./Button";
import Input from "./Input";
import { createClient } from "@/lib/supabase/client";

interface SelectOrCreateProps {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  placeholder?: string;
  entityType: "contact" | "company";
  onCreated: (item: { id: string; label: string }) => void;
}

export default function SelectOrCreate({ label, name, options, defaultValue, placeholder, entityType, onCreated }: SelectOrCreateProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [selectedValue, setSelectedValue] = useState(defaultValue ?? "");

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (entityType === "contact") {
      const { data, error } = await supabase
        .from("contacts")
        .insert({ full_name: newName.trim(), phone: newPhone || null, email: newEmail || null, created_by: user?.id })
        .select("id, full_name")
        .single();
      if (data) {
        onCreated({ id: data.id, label: data.full_name });
        setSelectedValue(data.id);
        setShowCreate(false);
        setNewName(""); setNewPhone(""); setNewEmail("");
      }
      if (error) alert(error.message);
    } else {
      const { data, error } = await supabase
        .from("companies")
        .insert({ name: newName.trim(), created_by: user?.id })
        .select("id, name")
        .single();
      if (data) {
        onCreated({ id: data.id, label: data.name });
        setSelectedValue(data.id);
        setShowCreate(false);
        setNewName("");
      }
      if (error) alert(error.message);
    }
    setCreating(false);
  }

  if (showCreate) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-slate-700">{label}</label>
          <button type="button" onClick={() => setShowCreate(false)} className="text-xs text-slate-400 hover:text-slate-600"><X size={14} /></button>
        </div>
        <div className="space-y-2 p-3 rounded-lg" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
          <Input
            label={entityType === "contact" ? "ФИО" : "Название"}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={entityType === "contact" ? "Иванов Иван" : "ООО Компания"}
            required
          />
          {entityType === "contact" && (
            <div className="grid grid-cols-2 gap-2">
              <Input label="Телефон" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+7..." />
              <Input label="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@..." />
            </div>
          )}
          <Button type="button" size="sm" onClick={handleCreate} loading={creating} disabled={!newName.trim()}>
            Создать {entityType === "contact" ? "контакт" : "компанию"}
          </Button>
        </div>
        <input type="hidden" name={name} value={selectedValue} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-0.5 text-xs hover:underline"
          style={{ color: "#0067a5" }}
        >
          <Plus size={12} /> Создать
        </button>
      </div>
      <select
        name={name}
        value={selectedValue}
        onChange={(e) => setSelectedValue(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-slate-300 hover:border-slate-400 bg-white"
      >
        <option value="">{placeholder ?? "Выберите..."}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
