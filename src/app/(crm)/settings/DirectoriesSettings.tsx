"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

type DirectoryTable = "venue_types" | "suppliers" | "lead_sources";

interface Item { id: string; name: string; sort_order: number }

const DIRECTORIES: { key: DirectoryTable; label: string }[] = [
  { key: "venue_types", label: "Типы заведений" },
  { key: "suppliers", label: "Поставщики / Конкуренты" },
  { key: "lead_sources", label: "Источники лидов" },
];

export default function DirectoriesSettings() {
  const [active, setActive] = useState<DirectoryTable>("venue_types");

  return (
    <div>
      <h2 className="text-sm font-semibold mb-4" style={{ color: "#333" }}>Справочники</h2>

      {/* Tabs */}
      <div className="flex gap-1 mb-5" style={{ borderBottom: "1px solid #e4e4e4" }}>
        {DIRECTORIES.map((d) => (
          <button
            key={d.key}
            onClick={() => setActive(d.key)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              borderBottom: active === d.key ? "2px solid #0067a5" : "2px solid transparent",
              color: active === d.key ? "#0067a5" : "#666",
              marginBottom: -1,
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      <DirectoryEditor table={active} />
    </div>
  );
}

function DirectoryEditor({ table }: { table: DirectoryTable }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingName, setAddingName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    setAdding(false);
    setAddingName("");
    setEditId(null);
    createClient().from(table).select("*").order("sort_order").then(({ data }) => setItems(data ?? []));
  }, [table]);

  async function addItem() {
    if (!addingName.trim()) return;
    setLoading(true);
    const { data } = await createClient()
      .from(table)
      .insert({ name: addingName.trim(), sort_order: items.length + 1 })
      .select()
      .single();
    if (data) setItems((p) => [...p, data]);
    setAddingName("");
    setAdding(false);
    setLoading(false);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    const { data } = await createClient().from(table).update({ name: editName.trim() }).eq("id", id).select().single();
    if (data) setItems((p) => p.map((i) => i.id === id ? data : i));
    setEditId(null);
  }

  async function deleteItem(id: string) {
    if (!confirm("Удалить элемент справочника?")) return;
    const { error } = await createClient().from(table).delete().eq("id", id);
    if (!error) setItems((p) => p.filter((i) => i.id !== id));
  }

  return (
    <div className="max-w-lg">
      <div style={{ border: "1px solid #e4e4e4", borderRadius: 6, overflow: "hidden" }}>
        {items.length === 0 && !adding && (
          <div className="px-4 py-6 text-center text-sm" style={{ color: "#aaa" }}>Справочник пуст</div>
        )}
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: idx < items.length - 1 ? "1px solid #f0f0f0" : "none", background: "#fff" }}
          >
            {editId === item.id ? (
              <>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit(item.id)}
                  className="flex-1 text-sm px-2 py-1 focus:outline-none"
                  style={{ border: "1px solid #0067a5", borderRadius: 4 }}
                />
                <button onClick={() => saveEdit(item.id)} className="p-1" style={{ color: "#0067a5" }}><Check size={14} /></button>
                <button onClick={() => setEditId(null)} className="p-1" style={{ color: "#888" }}><X size={14} /></button>
              </>
            ) : (
              <>
                <span className="text-xs w-5 flex-shrink-0" style={{ color: "#bbb" }}>{idx + 1}</span>
                <span className="flex-1 text-sm" style={{ color: "#333" }}>{item.name}</span>
                <button
                  onClick={() => { setEditId(item.id); setEditName(item.name); }}
                  className="p-1 transition-colors hover:opacity-70"
                  style={{ color: "#888" }}
                >
                  <Pencil size={13} />
                </button>
                <button onClick={() => deleteItem(item.id)} className="p-1 transition-colors hover:opacity-70" style={{ color: "#d32f2f" }}>
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        ))}

        {adding && (
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid #f0f0f0" }}>
            <input
              autoFocus
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Название..."
              className="flex-1 text-sm px-2 py-1 focus:outline-none"
              style={{ border: "1px solid #0067a5", borderRadius: 4 }}
            />
            <button onClick={addItem} disabled={loading || !addingName.trim()} className="p-1" style={{ color: "#0067a5" }}>
              <Check size={14} />
            </button>
            <button onClick={() => { setAdding(false); setAddingName(""); }} className="p-1" style={{ color: "#888" }}>
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {!adding && (
        <div className="mt-3">
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={13} /> Добавить
          </Button>
        </div>
      )}
    </div>
  );
}
