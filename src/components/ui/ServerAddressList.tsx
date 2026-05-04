"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, MapPin, Star } from "lucide-react";

interface AddressRow {
  id: string;
  company_id: string;
  address: string;
  kind: "legal" | "delivery" | "office" | "other";
  is_default: boolean;
  notes: string | null;
}

const KIND_LABELS: Record<string, string> = {
  legal: "Юридический",
  delivery: "Доставка",
  office: "Офис",
  other: "Другой",
};

const KIND_COLORS: Record<string, string> = {
  legal: "#0067a5",
  delivery: "#2e7d32",
  office: "#7b1fa2",
  other: "#888",
};

// Server-backed addresses (backlog v5 §3) — every company has N addresses,
// adding a new one (e.g. from a deal) doesn't clobber existing ones.
// The legacy AddressList works against the JSONB column on companies; this
// component talks to /api/addresses and is what the company detail card +
// deal delivery picker should use going forward.
export default function ServerAddressList({ companyId, readOnly = false, onChanged }: { companyId: string; readOnly?: boolean; onChanged?: (addresses: AddressRow[]) => void }) {
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newKind, setNewKind] = useState<AddressRow["kind"]>("delivery");
  const [newAddress, setNewAddress] = useState("");

  async function reload() {
    const res = await fetch(`/api/addresses?company_id=${companyId}`);
    if (res.ok) {
      const d = await res.json();
      setAddresses(d.addresses ?? []);
      onChanged?.(d.addresses ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId]);

  async function add() {
    if (!newAddress.trim()) return;
    const res = await fetch("/api/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: companyId, address: newAddress.trim(), kind: newKind, is_default: addresses.filter((a) => a.kind === newKind).length === 0 }),
    });
    if (res.ok) {
      setNewAddress("");
      setAdding(false);
      await reload();
    } else {
      const d = await res.json();
      alert("Не удалось добавить: " + (d.error || res.status));
    }
  }

  async function remove(id: string) {
    if (!confirm("Удалить адрес?")) return;
    const res = await fetch("/api/addresses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await reload();
  }

  async function makeDefault(addr: AddressRow) {
    const res = await fetch("/api/addresses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: addr.id, is_default: true }),
    });
    if (res.ok) await reload();
  }

  if (loading) return <p className="text-xs" style={{ color: "#aaa" }}>Загрузка адресов...</p>;

  return (
    <div className="space-y-1.5">
      {addresses.map((a) => (
        <div key={a.id} className="flex items-start gap-2">
          <MapPin size={13} className="mt-1 flex-shrink-0" style={{ color: KIND_COLORS[a.kind] }} />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium" style={{ color: KIND_COLORS[a.kind] }}>{KIND_LABELS[a.kind]}{a.is_default ? " (по умолчанию)" : ""}: </span>
            <span className="text-sm" style={{ color: "#333" }}>{a.address}</span>
          </div>
          {!readOnly && (
            <>
              {!a.is_default && (
                <button onClick={() => makeDefault(a)} className="p-0.5 rounded hover:bg-amber-50 flex-shrink-0 mt-0.5" title="Сделать основным">
                  <Star size={12} className="text-amber-500" />
                </button>
              )}
              <button onClick={() => remove(a.id)} className="p-0.5 rounded hover:bg-red-50 flex-shrink-0 mt-0.5" title="Удалить">
                <Trash2 size={12} className="text-red-400" />
              </button>
            </>
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
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as AddressRow["kind"])}
            className="text-xs px-1.5 py-1 rounded" style={{ border: "1px solid #d0d0d0" }}>
            {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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

export type { AddressRow };
