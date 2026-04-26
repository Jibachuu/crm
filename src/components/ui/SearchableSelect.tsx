"use client";

import { useState, useRef, useEffect } from "react";

interface Option { id: string; label: string; sublabel?: string }

export default function SearchableSelect({ options, value, onChange, placeholder = "Поиск...", style }: { options: Option[]; value: string; onChange: (id: string) => void; placeholder?: string; style?: React.CSSProperties }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const q = query.toLowerCase();
  // Wider limit + show clear "introduce search" hint when empty so the
  // user understands the А-block isn't the entire list (was confusing
  // managers who saw only contacts starting with "А" and assumed the
  // dropdown was broken).
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q)).slice(0, 200)
    : options.slice(0, 200);
  const truncated = !query && options.length > 200;

  const inputStyle: React.CSSProperties = style ?? { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };

  return (
    <div ref={ref} className="relative">
      <input
        value={open ? query : (selected?.label ?? "")}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(""); }}
        placeholder={placeholder}
        style={inputStyle}
      />
      {value && !open && (
        <button type="button" onClick={(e) => { e.preventDefault(); onChange(""); setQuery(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#aaa" }}>✕</button>
      )}
      {open && (
        <div className="absolute z-50 w-full mt-1 rounded shadow-lg max-h-60 overflow-y-auto" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
          {filtered.length === 0 && <p className="text-xs px-3 py-2" style={{ color: "#aaa" }}>Не найдено</p>}
          {filtered.map((o) => (
            <button type="button" key={o.id} onClick={() => { onChange(o.id); setOpen(false); setQuery(""); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50"
              style={{ borderBottom: "1px solid #f0f0f0", background: o.id === value ? "#e8f4fd" : "transparent" }}>
              {o.label}
              {o.sublabel && <span style={{ color: "#aaa", marginLeft: 6 }}>{o.sublabel}</span>}
            </button>
          ))}
          {truncated && (
            <p className="text-xs px-3 py-2 text-center" style={{ color: "#aaa", background: "#fafafa", borderTop: "1px solid #f0f0f0" }}>
              Показаны первые 200 из {options.length}. Введите запрос для поиска.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
