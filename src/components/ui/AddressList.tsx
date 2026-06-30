"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, MapPin } from "lucide-react";

interface Address {
  // Старые записи могли иметь type "legal" / "actual" / "other"; в UI
  // мы их больше не показываем — оставляем только "delivery". Поле
  // сохраняется в JSONB для обратной совместимости с историческими
  // записями (миграцию для них не делаем).
  type: string;
  address: string;
  comment?: string;
}

interface Props {
  addresses: Address[];
  onChange: (addresses: Address[]) => void;
  readOnly?: boolean;
}

// Каждая строка — собственный inline-editor, чтобы каждый keystroke не
// триггерил PUT /api/deals (а через side-effect не плодил дубли строк
// в public.addresses компании). Save срабатывает на blur/Enter.
function Row({
  value,
  comment,
  onSave,
  onRemove,
}: {
  value: string;
  comment: string;
  onSave: (next: { address: string; comment: string }) => void;
  onRemove: () => void;
}) {
  const [addr, setAddr] = useState(value);
  const [cmt, setCmt] = useState(comment);

  useEffect(() => { setAddr(value); }, [value]);
  useEffect(() => { setCmt(comment); }, [comment]);

  function commit() {
    const a = addr.trim();
    const c = cmt.trim();
    if (a === value.trim() && c === (comment ?? "").trim()) return;
    onSave({ address: a, comment: c });
  }

  return (
    <div className="flex items-start gap-2">
      <MapPin size={13} className="mt-1 flex-shrink-0" style={{ color: "#2e7d32" }} />
      <div className="flex-1 min-w-0 space-y-1">
        <input value={addr} onChange={(e) => setAddr(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="Адрес доставки"
          className="w-full text-sm px-1 py-0.5 rounded focus:outline-none"
          style={{ border: "1px solid transparent" }}
          onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#d0d0d0"; }} />
        <input value={cmt} onChange={(e) => setCmt(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="Комментарий (что везти, кому, к какому времени)"
          className="w-full text-xs px-1 py-0.5 rounded focus:outline-none italic"
          style={{ border: "1px solid transparent", color: "#666" }}
          onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#d0d0d0"; }} />
      </div>
      <button onClick={onRemove} className="p-0.5 rounded hover:bg-red-50 flex-shrink-0 mt-0.5">
        <Trash2 size={12} className="text-red-400" />
      </button>
    </div>
  );
}

export default function AddressList({ addresses, onChange, readOnly = false }: Props) {
  const [adding, setAdding] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newComment, setNewComment] = useState("");

  // Все адреса в этом блоке — адреса доставки. Если в JSONB ещё лежат
  // старые legal/actual/other из v45/v44, скрываем их из этого виджета.
  // Они уйдут из массива при первом save (UI прокидывает только
  // отфильтрованный список).
  const delivery = addresses.filter((a) => (a.type ?? "delivery") === "delivery");

  function add() {
    if (!newAddress.trim()) return;
    onChange([...delivery, { type: "delivery", address: newAddress.trim(), comment: newComment.trim() || undefined }]);
    setNewAddress("");
    setNewComment("");
    setAdding(false);
  }

  function remove(idx: number) {
    onChange(delivery.filter((_, i) => i !== idx));
  }

  function saveRow(idx: number, next: { address: string; comment: string }) {
    if (!next.address) { remove(idx); return; }
    onChange(delivery.map((a, i) => i === idx ? { ...a, address: next.address, comment: next.comment || undefined } : a));
  }

  if (readOnly) {
    return (
      <div className="space-y-2">
        {delivery.length === 0 && <p className="text-xs" style={{ color: "#aaa" }}>Нет адресов доставки</p>}
        {delivery.map((a, i) => (
          <div key={i} className="flex items-start gap-2">
            <MapPin size={13} className="mt-1 flex-shrink-0" style={{ color: "#2e7d32" }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm" style={{ color: "#333" }}>{a.address}</p>
              {a.comment && <p className="text-xs italic" style={{ color: "#888" }}>{a.comment}</p>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {delivery.map((addr, i) => (
        <Row
          key={i}
          value={addr.address}
          comment={addr.comment ?? ""}
          onSave={(next) => saveRow(i, next)}
          onRemove={() => remove(i)}
        />
      ))}

      {!adding && (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs" style={{ color: "#0067a5" }}>
          <Plus size={12} /> Добавить адрес доставки
        </button>
      )}

      {adding && (
        <div className="p-2 rounded space-y-1.5" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
          <input value={newAddress} onChange={(e) => setNewAddress(e.target.value)}
            placeholder="Адрес доставки" className="w-full text-sm px-2 py-1 rounded focus:outline-none"
            style={{ border: "1px solid #d0d0d0" }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) add(); }}
            autoFocus />
          <input value={newComment} onChange={(e) => setNewComment(e.target.value)}
            placeholder="Комментарий (необязательно — например, какие позиции едут сюда)"
            className="w-full text-xs px-2 py-1 rounded focus:outline-none italic"
            style={{ border: "1px solid #d0d0d0", color: "#666" }}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAdding(false); setNewAddress(""); setNewComment(""); }} className="text-xs px-2 py-1" style={{ color: "#888" }}>Отмена</button>
            <button onClick={add} className="text-xs px-3 py-1 rounded" style={{ background: "#0067a5", color: "#fff" }}>Добавить</button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { Address };
