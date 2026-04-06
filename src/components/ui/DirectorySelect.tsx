"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Check, X } from "lucide-react";

interface Option {
  id: string;
  name: string;
}

interface Props {
  table: "venue_types" | "suppliers" | "lead_sources";
  label: string;
  name: string;
  defaultValue?: string | null;
  onChange?: (id: string | null) => void;
}

export default function DirectorySelect({ table, label, name, defaultValue, onChange }: Props) {
  const [options, setOptions] = useState<Option[]>([]);
  const [value, setValue] = useState<string>(defaultValue ?? "");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    createClient()
      .from(table)
      .select("id, name")
      .order("sort_order")
      .then(({ data }) => setOptions(data ?? []));
  }, [table]);

  useEffect(() => {
    setValue(defaultValue ?? "");
  }, [defaultValue]);

  async function addNew() {
    if (!newName.trim()) return;
    setSaving(true);
    const { data } = await createClient()
      .from(table)
      .insert({ name: newName.trim(), sort_order: options.length + 1 })
      .select("id, name")
      .single();
    if (data) {
      setOptions((prev) => [...prev, data]);
      setValue(data.id);
      onChange?.(data.id);
      setAdding(false);
      setNewName("");
    }
    setSaving(false);
  }

  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: "#555" }}>
        {label}
      </label>
      {/* hidden input for form submission */}
      <input type="hidden" name={name} value={value} />
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onChange?.(e.target.value || null);
          }}
          className="flex-1 text-sm px-3 py-1.5 focus:outline-none"
          style={{
            border: "1px solid #d0d0d0",
            borderRadius: 4,
            background: "#fff",
            color: "#333",
          }}
        >
          <option value="">— Не выбрано —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="px-2 py-1.5 text-xs flex items-center gap-1 transition-colors"
            style={{
              border: "1px solid #d0d0d0",
              borderRadius: 4,
              color: "#0067a5",
              background: "#fff",
            }}
            title="Добавить новый"
          >
            <Plus size={12} />
          </button>
        )}
      </div>
      {adding && (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNew())}
            placeholder="Название..."
            className="flex-1 text-sm px-3 py-1.5 focus:outline-none"
            style={{ border: "1px solid #0067a5", borderRadius: 4 }}
          />
          <button
            type="button"
            onClick={addNew}
            disabled={saving || !newName.trim()}
            className="px-2 py-1.5"
            style={{ border: "1px solid #0067a5", borderRadius: 4, color: "#0067a5", background: "#e8f4fd" }}
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewName(""); }}
            className="px-2 py-1.5"
            style={{ border: "1px solid #ddd", borderRadius: 4, color: "#888" }}
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
