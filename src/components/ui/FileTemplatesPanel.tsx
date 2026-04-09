"use client";

import { useState, useEffect } from "react";
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
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  useEffect(() => {
    if (!open || templates.length > 0) return;
    setLoading(true);
    createClient().from("file_templates").select("*").order("folder").order("sort_order").then(({ data }) => {
      setTemplates(data ?? []);
      setLoading(false);
    });
  }, [open]);

  const folders = [...new Set(templates.map((t) => t.folder))];
  const folderFiles = activeFolder ? templates.filter((t) => t.folder === activeFolder) : [];

  function insertFolder() {
    if (!activeFolder) return;
    const files = folderFiles.map((f) => ({ url: f.file_url, name: f.name, type: f.file_type }));
    onInsert(files);
    setOpen(false);
  }

  function insertFile(f: FileTemplate) {
    onInsert([{ url: f.file_url, name: f.name, type: f.file_type }]);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
        title="Шаблоны файлов"
      >
        <FolderOpen size={16} style={{ color: "#888" }} />
      </button>
    );
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-xl z-50" style={{ border: "1px solid #e0e0e0", width: 320, maxHeight: 400 }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
        <span className="text-xs font-semibold" style={{ color: "#555" }}>Шаблоны</span>
        <button onClick={() => { setOpen(false); setActiveFolder(null); }}><X size={14} style={{ color: "#aaa" }} /></button>
      </div>

      {loading && <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Загрузка...</p>}

      {!loading && !activeFolder && (
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

      {!loading && activeFolder && (
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
    </div>
  );
}
