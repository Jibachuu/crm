"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, Image, FileText, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface FileTemplate {
  id: string;
  folder: string;
  name: string;
  file_url: string;
  file_type: string;
}

interface FileTemplatesPanelProps {
  onInsert: (files: { url: string; name: string; type: string }[]) => void;
}

export default function FileTemplatesPanel({ onInsert }: FileTemplatesPanelProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<FileTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    createClient().from("file_templates").select("*").order("folder").order("sort_order").then(({ data, error: err }) => {
      if (err) setError(err.message);
      else setTemplates(data ?? []);
      setLoading(false);
    });
    // Position popup above button
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 10, left: rect.left });
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const el = document.getElementById("file-templates-popup");
      if (el && !el.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActiveFolder(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const folders = [...new Set(templates.map((t) => t.folder))];
  const folderFiles = activeFolder ? templates.filter((t) => t.folder === activeFolder) : [];

  function insertFolder() {
    if (!activeFolder) return;
    const files = folderFiles.map((f) => ({ url: f.file_url, name: f.name, type: f.file_type }));
    onInsert(files);
    setOpen(false);
    setActiveFolder(null);
  }

  function insertFile(f: FileTemplate) {
    onInsert([{ url: f.file_url, name: f.name, type: f.file_type }]);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
        title="Шаблоны файлов"
      >
        <FolderOpen size={16} style={{ color: "#888" }} />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          id="file-templates-popup"
          className="bg-white rounded-lg shadow-xl"
          style={{
            position: "fixed",
            bottom: `calc(100vh - ${pos.top}px)`,
            left: pos.left,
            border: "1px solid #e0e0e0",
            width: 320,
            maxHeight: 400,
            zIndex: 9999,
          }}
        >
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
            <span className="text-xs font-semibold" style={{ color: "#555" }}>Шаблоны файлов</span>
            <button onClick={() => { setOpen(false); setActiveFolder(null); }}><X size={14} style={{ color: "#aaa" }} /></button>
          </div>

          {loading && <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Загрузка...</p>}
          {error && <p className="text-xs text-center py-4" style={{ color: "#e74c3c" }}>{error}</p>}

          {!loading && !error && !activeFolder && (
            <div className="p-2 space-y-1">
              {folders.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Нет шаблонов. Добавьте в Настройках.</p>
              ) : folders.map((folder) => {
                const count = templates.filter((t) => t.folder === folder).length;
                return (
                  <button key={folder} onClick={() => setActiveFolder(folder)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-50 text-left"
                  >
                    <FolderOpen size={14} style={{ color: "#0067a5" }} />
                    <span className="text-sm flex-1" style={{ color: "#333" }}>{folder}</span>
                    <span className="text-xs" style={{ color: "#aaa" }}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && !error && activeFolder && (
            <div>
              <button onClick={() => setActiveFolder(null)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50" style={{ color: "#0067a5", borderBottom: "1px solid #f0f0f0" }}>
                ← {activeFolder}
              </button>
              <div className="p-2 space-y-1 overflow-y-auto" style={{ maxHeight: 280 }}>
                {folderFiles.map((f) => (
                  <button key={f.id} onClick={() => insertFile(f)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-blue-50 text-left"
                  >
                    {f.file_type?.startsWith("image") ? <Image size={14} style={{ color: "#2e7d32" }} /> : <FileText size={14} style={{ color: "#e65c00" }} />}
                    <span className="text-sm truncate flex-1" style={{ color: "#333" }}>{f.name}</span>
                  </button>
                ))}
              </div>
              <div className="px-3 py-2" style={{ borderTop: "1px solid #f0f0f0" }}>
                <button onClick={insertFolder} className="w-full text-xs py-1.5 rounded font-medium" style={{ background: "#0067a5", color: "#fff" }}>
                  <Plus size={12} className="inline mr-1" />Вставить все ({folderFiles.length})
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
