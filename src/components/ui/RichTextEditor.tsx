"use client";

import { useRef, useEffect } from "react";
import { Bold, Italic, Underline, Type } from "lucide-react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export default function RichTextEditor({ value, onChange, placeholder, minHeight = 120 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Track what value we've already set into the DOM so we don't overwrite user input
  const domValueRef = useRef<string>("");

  // On mount, seed the innerHTML with value
  useEffect(() => {
    if (ref.current && (value ?? "") !== domValueRef.current) {
      // Only update if it's genuinely different from what's in the DOM
      const currentDom = ref.current.innerHTML;
      if ((value ?? "") !== currentDom) {
        ref.current.innerHTML = value ?? "";
      }
      domValueRef.current = value ?? "";
    }
  }, [value]);

  function exec(cmd: string, arg?: string) {
    if (!ref.current) return;
    ref.current.focus();
    document.execCommand(cmd, false, arg);
    const html = ref.current.innerHTML;
    domValueRef.current = html;
    onChange(html);
  }

  function handleInput() {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    domValueRef.current = html;
    onChange(html);
  }

  const btnStyle: React.CSSProperties = { padding: "4px 8px", border: "1px solid #e0e0e0", background: "#fff", borderRadius: 4, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11 };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, padding: 4, background: "#fafafa", border: "1px solid #e0e0e0", borderBottom: "none", borderRadius: "4px 4px 0 0", flexWrap: "wrap" }}>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")} title="Жирный (Ctrl+B)" style={btnStyle}><Bold size={12} /></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")} title="Курсив (Ctrl+I)" style={btnStyle}><Italic size={12} /></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")} title="Подчёркнутый (Ctrl+U)" style={btnStyle}><Underline size={12} /></button>
        <div style={{ width: 1, background: "#e0e0e0", margin: "0 2px" }} />
        <select onMouseDown={(e) => e.stopPropagation()} onChange={(e) => { exec("fontSize", e.target.value); e.target.value = ""; }}
          style={{ ...btnStyle, padding: "4px 6px" }} defaultValue="">
          <option value="">Размер</option>
          <option value="2">Маленький</option>
          <option value="3">Обычный</option>
          <option value="5">Крупный</option>
          <option value="6">Заголовок</option>
        </select>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("formatBlock", "<h3>")} title="Заголовок" style={btnStyle}><Type size={12} /> H</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertUnorderedList")} title="Список" style={btnStyle}>•</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("removeFormat")} title="Убрать форматирование" style={btnStyle}>×</button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        style={{
          minHeight,
          padding: "8px 10px",
          border: "1px solid #e0e0e0",
          borderRadius: "0 0 4px 4px",
          fontSize: 13,
          lineHeight: 1.5,
          outline: "none",
          background: "#fff",
        }}
        data-placeholder={placeholder}
      />
      <style>{`
        [contenteditable][data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #aaa;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
