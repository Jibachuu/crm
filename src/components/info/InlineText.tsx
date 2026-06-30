"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string | null | undefined;
  onSave: (next: string | null) => Promise<void> | void;
  placeholder?: string;
  multiline?: boolean;
  empty?: string;
  className?: string;
  inputClassName?: string;
};

export default function InlineText({ value, onSave, placeholder, multiline, empty = "—", className, inputClassName }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => { setDraft(value ?? ""); }, [value]);
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      if ("setSelectionRange" in ref.current) {
        const v = ref.current.value;
        ref.current.setSelectionRange(v.length, v.length);
      }
    }
  }, [editing]);

  async function commit() {
    const next = draft.trim() === "" ? null : draft;
    if ((value ?? null) === next) { setEditing(false); return; }
    setSaving(true);
    setErr(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
    setErr(null);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`text-left w-full hover:bg-slate-50 rounded px-1.5 py-0.5 -mx-1.5 transition-colors ${className ?? ""}`}
        title="Нажмите чтобы редактировать"
      >
        {value && value.trim() !== "" ? (
          <span className={multiline ? "whitespace-pre-wrap text-slate-700" : "text-slate-700"}>{value}</span>
        ) : (
          <span className="text-slate-400 italic">{placeholder ?? empty}</span>
        )}
      </button>
    );
  }

  const common = `w-full text-sm rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 ${inputClassName ?? ""}`;
  const style = { border: "1px solid #d0d0d0" } as const;

  return (
    <div className={className}>
      {multiline ? (
        <textarea
          ref={(el) => { ref.current = el; }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Escape") cancel(); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commit(); }}
          placeholder={placeholder}
          rows={3}
          className={common}
          style={style}
          disabled={saving}
        />
      ) : (
        <input
          ref={(el) => { ref.current = el; }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Escape") cancel(); if (e.key === "Enter") commit(); }}
          placeholder={placeholder}
          className={common}
          style={style}
          disabled={saving}
        />
      )}
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </div>
  );
}
