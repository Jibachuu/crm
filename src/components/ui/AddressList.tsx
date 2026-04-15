"use client";

import { useState } from "react";
import { Plus, Trash2, MapPin } from "lucide-react";

interface Address {
  type: string; // "legal", "actual", "delivery", "other"
  address: string;
}

const TYPE_LABELS: Record<string, string> = {
  legal: "Юридический",
  actual: "Фактический",
  delivery: "Доставка",
  other: "Другой",
};

interface Props {
  addresses: Address[];
  onChange: (addresses: Address[]) => void;
  readOnly?: boolean;
}

export default function AddressList({ addresses, onChange, readOnly = false }: Props) {
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("delivery");
  const [newAddress, setNewAddress] = useState("");

  function add() {
    if (!newAddress.trim()) return;
    onChange([...addresses, { type: newType, address: newAddress.trim() }]);
    setNewAddress("");
    setAdding(false);
  }

  function remove(idx: number) {
    onChange(addresses.filter((_, i) => i !== idx));
  }

  function update(idx: number, address: string) {
    onChange(addresses.map((a, i) => i === idx ? { ...a, address } : a));
  }

  return (
    <div className="space-y-1.5">
      {addresses.map((addr, i) => (
        <div key={i} className="flex items-start gap-2">
          <MapPin size={13} className="mt-1 flex-shrink-0" style={{ color: addr.type === "delivery" ? "#2e7d32" : addr.type === "legal" ? "#0067a5" : "#888" }} />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium" style={{ color: "#888" }}>{TYPE_LABELS[addr.type] || addr.type}: </span>
            {readOnly ? (
              <span className="text-sm" style={{ color: "#333" }}>{addr.address}</span>
            ) : (
              <input value={addr.address} onChange={(e) => update(i, e.target.value)}
                className="w-full text-sm px-1 py-0.5 rounded focus:outline-none"
                style={{ border: "1px solid transparent" }}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#d0d0d0"; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "transparent"; }} />
            )}
          </div>
          {!readOnly && (
            <button onClick={() => remove(i)} className="p-0.5 rounded hover:bg-red-50 flex-shrink-0 mt-0.5">
              <Trash2 size={12} className="text-red-400" />
            </button>
          )}
        </div>
      ))}

      {!readOnly && !adding && (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs" style={{ color: "#0067a5" }}>
          <Plus size={12} /> Добавить адрес
        </button>
      )}

      {adding && (
        <div className="flex items-center gap-2 p-2 rounded" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
          <select value={newType} onChange={(e) => setNewType(e.target.value)}
            className="text-xs px-1.5 py-1 rounded" style={{ border: "1px solid #d0d0d0" }}>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={newAddress} onChange={(e) => setNewAddress(e.target.value)}
            placeholder="Введите адрес..." className="flex-1 text-sm px-2 py-1 rounded focus:outline-none"
            style={{ border: "1px solid #d0d0d0" }}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <button onClick={add} className="text-xs px-2 py-1 rounded" style={{ background: "#0067a5", color: "#fff" }}>OK</button>
          <button onClick={() => setAdding(false)} className="text-xs px-1 py-1" style={{ color: "#888" }}>✕</button>
        </div>
      )}

      {addresses.length === 0 && readOnly && (
        <p className="text-xs" style={{ color: "#aaa" }}>Нет адресов</p>
      )}
    </div>
  );
}

export type { Address };
