"use client";

import { useState, useMemo } from "react";
import { Plus, X, Search } from "lucide-react";
import Button from "./Button";
import Input from "./Input";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, searchQuery]);

  const selectedLabel = options.find((o) => o.value === selectedValue)?.label ?? "";

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      if (entityType === "contact") {
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full_name: newName.trim(), phone: newPhone || null, email: newEmail || null }),
        });
        const data = await res.json();
        if (res.ok && data.id) {
          onCreated({ id: data.id, label: data.full_name });
          setSelectedValue(data.id);
          setShowCreate(false);
          setNewName(""); setNewPhone(""); setNewEmail("");
        } else { alert(data.error || "Ошибка"); }
      } else {
        const res = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim() }),
        });
        const data = await res.json();
        if (res.ok && data.id) {
          onCreated({ id: data.id, label: data.name });
          setSelectedValue(data.id);
          setShowCreate(false);
          setNewName("");
        } else { alert(data.error || "Ошибка"); }
      }
    } catch (e) { alert(String(e)); }
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
    <div className="relative">
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

      {/* Searchable dropdown */}
      <div
        className="w-full rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center justify-between"
        style={{ borderColor: dropdownOpen ? "#0067a5" : "#cbd5e1", background: "#fff" }}
        onClick={() => setDropdownOpen(!dropdownOpen)}
      >
        <span style={{ color: selectedLabel ? "#333" : "#aaa" }}>
          {selectedLabel || placeholder || "Выберите..."}
        </span>
        {selectedValue && (
          <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedValue(""); }} className="ml-1 hover:text-red-500">
            <X size={12} style={{ color: "#aaa" }} />
          </button>
        )}
      </div>

      {dropdownOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-lg shadow-lg border" style={{ maxHeight: 280, borderColor: "#e0e0e0" }}>
          <div className="p-2 sticky top-0 bg-white" style={{ borderBottom: "1px solid #f0f0f0" }}>
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск..."
                className="w-full pl-7 pr-2 py-1 text-xs rounded focus:outline-none"
                style={{ border: "1px solid #e0e0e0" }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50"
              style={{ color: "#aaa" }}
              onClick={() => { setSelectedValue(""); setDropdownOpen(false); setSearchQuery(""); }}
            >
              {placeholder || "Очистить"}
            </button>
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50"
                style={{ background: opt.value === selectedValue ? "#e8f4fd" : "transparent", color: "#333" }}
                onClick={() => { setSelectedValue(opt.value); setDropdownOpen(false); setSearchQuery(""); }}
              >
                {opt.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-center py-3" style={{ color: "#aaa" }}>Не найдено</p>
            )}
          </div>
        </div>
      )}

      <input type="hidden" name={name} value={selectedValue} />

      {/* Close dropdown on outside click */}
      {dropdownOpen && (
        <div className="fixed inset-0 z-40" onClick={() => { setDropdownOpen(false); setSearchQuery(""); }} />
      )}
    </div>
  );
}
