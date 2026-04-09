"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, FolderOpen, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface FileTemplate {
  id: string;
  folder: string;
  name: string;
  file_url: string;
  file_type: string;
}

export default function FileTemplatesSettings() {
  const [templates, setTemplates] = useState<FileTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFolder, setNewFolder] = useState("");
  const [uploading, setUploading] = useState(false);

  async function load() {
    const { data } = await createClient().from("file_templates").select("*").order("folder").order("sort_order");
    setTemplates(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function uploadFiles(folder: string, files: FileList) {
    setUploading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    for (const file of Array.from(files)) {
      // Upload to Supabase storage
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (data.url) {
        await supabase.from("file_templates").insert({
          folder,
          name: file.name,
          file_url: data.url,
          file_type: file.type,
          created_by: user?.id,
        });
      }
    }
    setUploading(false);
    load();
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Удалить?")) return;
    await createClient().from("file_templates").delete().eq("id", id);
    load();
  }

  const folders = [...new Set(templates.map((t) => t.folder))];

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3" style={{ color: "#333" }}>Шаблоны файлов и фото</h3>
      <p className="text-xs mb-4" style={{ color: "#888" }}>
        Папки с фото и файлами, доступные менеджерам в чатах для быстрой отправки
      </p>

      {/* Add folder */}
      <div className="flex gap-2 mb-4">
        <input
          value={newFolder}
          onChange={(e) => setNewFolder(e.target.value)}
          placeholder="Новая папка..."
          className="flex-1 text-sm px-3 py-1.5 rounded focus:outline-none"
          style={{ border: "1px solid #d0d0d0" }}
        />
        <label className="flex items-center gap-1 text-xs px-3 py-1.5 rounded cursor-pointer"
          style={{ background: "#0067a5", color: "#fff" }}>
          <Upload size={12} /> Загрузить в папку
          <input type="file" multiple className="hidden" disabled={!newFolder.trim() || uploading}
            onChange={(e) => { if (e.target.files?.length && newFolder.trim()) uploadFiles(newFolder.trim(), e.target.files); e.target.value = ""; }} />
        </label>
      </div>

      {loading ? (
        <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Загрузка...</p>
      ) : folders.length === 0 ? (
        <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Нет шаблонов</p>
      ) : (
        <div className="space-y-4">
          {folders.map((folder) => {
            const files = templates.filter((t) => t.folder === folder);
            return (
              <div key={folder} className="rounded-lg p-3" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FolderOpen size={14} style={{ color: "#0067a5" }} />
                    <span className="text-sm font-medium" style={{ color: "#333" }}>{folder}</span>
                    <span className="text-xs" style={{ color: "#aaa" }}>{files.length} файлов</span>
                  </div>
                  <label className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer hover:bg-white"
                    style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}>
                    <Plus size={10} /> Добавить
                    <input type="file" multiple className="hidden" disabled={uploading}
                      onChange={(e) => { if (e.target.files?.length) uploadFiles(folder, e.target.files); e.target.value = ""; }} />
                  </label>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {files.map((f) => (
                    <div key={f.id} className="relative group rounded overflow-hidden" style={{ border: "1px solid #e0e0e0", background: "#fff" }}>
                      {f.file_type?.startsWith("image") ? (
                        <img src={f.file_url} alt={f.name} className="w-full h-16 object-cover" />
                      ) : (
                        <div className="w-full h-16 flex items-center justify-center text-xs" style={{ color: "#888" }}>
                          {f.name.split(".").pop()?.toUpperCase()}
                        </div>
                      )}
                      <p className="text-xs px-1 py-0.5 truncate" style={{ color: "#555" }}>{f.name}</p>
                      <button onClick={() => deleteTemplate(f.id)}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={10} style={{ color: "#e74c3c" }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {uploading && <p className="text-xs mt-2" style={{ color: "#0067a5" }}>Загрузка...</p>}
    </div>
  );
}
