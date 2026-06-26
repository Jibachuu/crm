"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, Editor, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { FontFamily } from "@tiptap/extension-font-family";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Quote, Minus, Link as LinkIcon, Image as ImageIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Undo, Redo, RotateCcw, Code, Table as TableIcon, Heading1, Heading2, Heading3,
  Type, Palette, Highlighter, FileCode,
} from "lucide-react";

// Кастомное расширение размера шрифта поверх TextStyle.
// TipTap не имеет готового FontSize в наборе, но это типовой
// pattern из их docs — добавляем attribute fontSize.
const FontSize = Extension.create({
  name: "fontSize",
  addOptions() { return { types: ["textStyle"] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types as string[],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: { fontSize?: string }) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: { chain: () => { setMark: (n: string, a: object) => { run: () => boolean } & ReturnType<typeof chain> } }) =>
        chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: { chain: () => { setMark: (n: string, a: object) => { run: () => boolean } & ReturnType<typeof chain> } }) =>
        chain().setMark("textStyle", { fontSize: null }).run(),
    } as Record<string, unknown>;
  },
});

interface Props {
  value: string;
  onChange: (html: string) => void;
  onPasteFiles?: (files: File[]) => void;
  placeholder?: string;
  minHeight?: number;
}

export default function RichEmailEditor({ value, onChange, onPasteFiles, placeholder, minHeight = 200 }: Props) {
  const [showHtmlSource, setShowHtmlSource] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Enable everything; link/image overridden below with extra options.
        link: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,        // в редакторе клик ставит каретку, ссылка кликабельна в готовом письме
        autolink: true,             // bare URL → ссылка
        linkOnPaste: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Image.configure({
        allowBase64: true,          // inline картинки через data URL
        inline: false,
        HTMLAttributes: { style: "max-width: 100%; height: auto;" },
      }),
      TextStyle,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      FontFamily,
    ],
    content: value,
    immediatelyRender: false,        // Next.js SSR-safe
    editorProps: {
      attributes: {
        class: "tiptap-content",
      },
      handlePaste(_view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const files: File[] = [];
        for (const it of Array.from(items)) {
          if (it.kind === "file") {
            const f = it.getAsFile();
            if (f) files.push(f);
          }
        }
        if (files.length === 0) return false;

        // Картинки — встраиваем inline (data URL) для превью И параллельно
        // отправляем в attachments-callback. Раньше делали только inline
        // → Gmail/Outlook часто блокируют base64-img → получатель не видел
        // картинку (Рустем 29.05.2026: «прикрепил картинку, но она не
        // прикрепилась хотя визуально была в письме как файл»). Теперь
        // картинка попадает И в HTML тело (для превью / клиентов умеющих
        // base64) И как реальный attachment файла.
        const images = files.filter((f) => f.type.startsWith("image/"));
        const others = files.filter((f) => !f.type.startsWith("image/"));
        if (images.length > 0) {
          event.preventDefault();
          Promise.all(images.map(fileToDataUrl)).then((urls) => {
            urls.forEach((url) => editor?.chain().focus().setImage({ src: url }).run());
          });
          if (onPasteFiles) onPasteFiles(images);
        }
        if (others.length > 0 && onPasteFiles) {
          if (images.length === 0) event.preventDefault();
          onPasteFiles(others);
        }
        return images.length > 0 || (others.length > 0 && !!onPasteFiles);
      },
      handleDrop(_view, event) {
        const dt = (event as DragEvent).dataTransfer;
        if (!dt || dt.files.length === 0) return false;
        const files = Array.from(dt.files);
        const images = files.filter((f) => f.type.startsWith("image/"));
        const others = files.filter((f) => !f.type.startsWith("image/"));
        if (images.length === 0 && others.length === 0) return false;
        event.preventDefault();
        Promise.all(images.map(fileToDataUrl)).then((urls) => {
          urls.forEach((url) => editor?.chain().focus().setImage({ src: url }).run());
        });
        // Та же логика что в paste — картинки и inline и attachment.
        if (images.length > 0 && onPasteFiles) onPasteFiles(images);
        if (others.length > 0 && onPasteFiles) onPasteFiles(others);
        return true;
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes (templates, signature insertion).
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) {
    return <div style={{ minHeight, border: "1px solid #d0d0d0", borderRadius: 4, background: "#fafafa" }} />;
  }

  return (
    <div style={{ border: "1px solid #d0d0d0", borderRadius: 4, background: "#fff", overflow: "hidden" }}>
      <style>{`
        .tiptap-content { padding: 10px; min-height: ${minHeight}px; outline: none; font-size: 13px; line-height: 1.5; }
        .tiptap-content p { margin: 0 0 8px; }
        .tiptap-content p:empty::before { content: ${placeholder ? `"${placeholder.replace(/"/g, '\\"')}"` : '""'}; color: #aaa; }
        .tiptap-content > p:not(:first-child):empty::before { content: ""; }
        .tiptap-content h1 { font-size: 22px; font-weight: 700; margin: 12px 0 8px; }
        .tiptap-content h2 { font-size: 18px; font-weight: 700; margin: 10px 0 6px; }
        .tiptap-content h3 { font-size: 15px; font-weight: 700; margin: 8px 0 4px; }
        .tiptap-content ul, .tiptap-content ol { padding-left: 22px; margin: 4px 0 8px; }
        .tiptap-content blockquote { border-left: 3px solid #d0d0d0; margin: 8px 0; padding: 4px 10px; color: #555; }
        .tiptap-content hr { border: none; border-top: 1px solid #ddd; margin: 12px 0; }
        .tiptap-content a { color: #0067a5; text-decoration: underline; }
        .tiptap-content img { max-width: 100%; height: auto; border-radius: 3px; }
        .tiptap-content table { border-collapse: collapse; margin: 8px 0; }
        .tiptap-content td, .tiptap-content th { border: 1px solid #ccc; padding: 4px 6px; min-width: 30px; }
        .tiptap-content th { background: #f5f5f5; font-weight: 600; }
        .tiptap-content code { background: #f0f0f0; padding: 1px 4px; border-radius: 2px; font-size: 12px; font-family: monospace; }
        .tiptap-content pre { background: #f5f5f5; padding: 8px; border-radius: 3px; overflow-x: auto; font-size: 12px; }
        .tt-btn { padding: 4px 6px; border-radius: 3px; color: #555; transition: background 0.1s; display: inline-flex; align-items: center; }
        .tt-btn:hover { background: #e8eef5; }
        .tt-btn.active { background: #cfe2f3; color: #0067a5; }
        .tt-sep { width: 1px; height: 20px; background: #d0d0d0; margin: 0 3px; }
        .tt-toolbar { display: flex; flex-wrap: wrap; gap: 1px; padding: 4px; border-bottom: 1px solid #d0d0d0; background: #fafafa; align-items: center; }
        .tt-select { font-size: 12px; padding: 2px 4px; border: 1px solid #ddd; border-radius: 3px; background: #fff; color: #555; }
      `}</style>

      <div className="tt-toolbar">
        <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Отменить (Ctrl+Z)"><Undo size={14} /></Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Вернуть (Ctrl+Y)"><Redo size={14} /></Btn>
        <Sep />

        <HeadingSelect editor={editor} />
        <FontFamilySelect editor={editor} />
        <FontSizeSelect editor={editor} />
        <Sep />

        <Btn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Полужирный (Ctrl+B)"><Bold size={14} /></Btn>
        <Btn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Курсив (Ctrl+I)"><Italic size={14} /></Btn>
        <Btn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Подчёркнутый (Ctrl+U)"><UnderlineIcon size={14} /></Btn>
        <Btn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Зачёркнутый"><Strikethrough size={14} /></Btn>
        <ColorPicker editor={editor} kind="color" />
        <ColorPicker editor={editor} kind="highlight" />
        <Sep />

        <Btn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Маркированный список"><List size={14} /></Btn>
        <Btn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Нумерованный список"><ListOrdered size={14} /></Btn>
        <Btn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="По левому"><AlignLeft size={14} /></Btn>
        <Btn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="По центру"><AlignCenter size={14} /></Btn>
        <Btn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="По правому"><AlignRight size={14} /></Btn>
        <Btn active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()} title="По ширине"><AlignJustify size={14} /></Btn>
        <Sep />

        <Btn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Цитата"><Quote size={14} /></Btn>
        <Btn active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Блок кода"><Code size={14} /></Btn>
        <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Разделитель"><Minus size={14} /></Btn>
        <Sep />

        <LinkButton editor={editor} />
        <Btn onClick={() => fileInputRef.current?.click()} title="Вставить картинку из файла"><ImageIcon size={14} /></Btn>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const url = await fileToDataUrl(f);
            editor.chain().focus().setImage({ src: url }).run();
            e.target.value = "";
          }}
        />
        <Btn onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Вставить таблицу"><TableIcon size={14} /></Btn>
        <Sep />

        <Btn onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Снять форматирование"><RotateCcw size={14} /></Btn>
        <Btn active={showHtmlSource} onClick={() => setShowHtmlSource((v) => !v)} title="Показать HTML-исходник"><FileCode size={14} /></Btn>
      </div>

      {showHtmlSource ? (
        <textarea
          value={editor.getHTML()}
          onChange={(e) => editor.commands.setContent(e.target.value)}
          style={{ width: "100%", minHeight, padding: 10, fontFamily: "monospace", fontSize: 12, border: "none", outline: "none" }}
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}

function Btn({ children, onClick, active, disabled, title }: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`tt-btn ${active ? "active" : ""}`}
      style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer", background: "transparent", border: "none" }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="tt-sep" />;
}

function HeadingSelect({ editor }: { editor: Editor }) {
  const value = editor.isActive("heading", { level: 1 }) ? "h1"
    : editor.isActive("heading", { level: 2 }) ? "h2"
    : editor.isActive("heading", { level: 3 }) ? "h3"
    : "p";
  return (
    <select
      className="tt-select"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "p") editor.chain().focus().setParagraph().run();
        else editor.chain().focus().toggleHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
      }}
      title="Тип параграфа"
    >
      <option value="p">Текст</option>
      <option value="h1">Заголовок 1</option>
      <option value="h2">Заголовок 2</option>
      <option value="h3">Заголовок 3</option>
    </select>
  );
}

function FontFamilySelect({ editor }: { editor: Editor }) {
  const families = [
    { label: "Шрифт", value: "" },
    { label: "Sans-serif", value: "Arial, Helvetica, sans-serif" },
    { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
    { label: "Mono", value: "Menlo, Consolas, monospace" },
  ];
  return (
    <select
      className="tt-select"
      value=""
      onChange={(e) => {
        const v = e.target.value;
        if (!v) editor.chain().focus().unsetFontFamily().run();
        else editor.chain().focus().setFontFamily(v).run();
      }}
      title="Семейство шрифтов"
    >
      {families.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
    </select>
  );
}

function FontSizeSelect({ editor }: { editor: Editor }) {
  const sizes = ["", "10px", "12px", "13px", "14px", "16px", "18px", "20px", "24px", "32px"];
  return (
    <select
      className="tt-select"
      value=""
      onChange={(e) => {
        const v = e.target.value;
        const ed = editor as Editor & { commands: { setFontSize?: (s: string) => boolean; unsetFontSize?: () => boolean } };
        if (!v) ed.commands.unsetFontSize?.();
        else ed.commands.setFontSize?.(v);
        editor.commands.focus();
      }}
      title="Размер шрифта"
    >
      <option value="">Размер</option>
      {sizes.filter(Boolean).map((s) => <option key={s} value={s}>{s.replace("px", "")}</option>)}
    </select>
  );
}

function ColorPicker({ editor, kind }: { editor: Editor; kind: "color" | "highlight" }) {
  const Icon = kind === "color" ? Palette : Highlighter;
  return (
    <label className="tt-btn" title={kind === "color" ? "Цвет текста" : "Заливка (выделение)"} style={{ cursor: "pointer", position: "relative" }}>
      <Icon size={14} />
      <input
        type="color"
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
        onChange={(e) => {
          if (kind === "color") editor.chain().focus().setColor(e.target.value).run();
          else editor.chain().focus().toggleHighlight({ color: e.target.value }).run();
        }}
      />
    </label>
  );
}

function LinkButton({ editor }: { editor: Editor }) {
  const isActive = editor.isActive("link");
  function handleClick() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = prompt("Введите URL (https://...)", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const safe = url.startsWith("http") ? url : "https://" + url;
    editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
  }
  return (
    <Btn active={isActive} onClick={handleClick} title={isActive ? "Изменить ссылку" : "Вставить ссылку"}>
      <LinkIcon size={14} />
    </Btn>
  );
}

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ignored = Type;  // Type icon may be added later for a "case" menu — keep import warm.
