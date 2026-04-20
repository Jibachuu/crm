"use client";

import { useState, useRef, useCallback } from "react";
import { Plus, FolderPlus, Trash2, Edit2, Image, Upload, X, Copy, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

interface Folder { id: string; name: string; description: string | null; sort_order: number }
interface Photo { id: string; folder_id: string; name: string | null; description: string | null; url: string; file_type: string | null; file_size: number | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function GalleryClient({ initialFolders, initialPhotos }: { initialFolders: any[]; initialPhotos: any[] }) {
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderDesc, setFolderDesc] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [photoDesc, setPhotoDesc] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPhotos = selectedFolder ? photos.filter((p) => p.folder_id === selectedFolder) : photos;

  // Folder CRUD
  async function saveFolder() {
    if (!folderName.trim()) return;
    const res = await fetch("/api/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingFolder
        ? { action: "update_folder", id: editingFolder.id, name: folderName, description: folderDesc }
        : { action: "create_folder", name: folderName, description: folderDesc }),
    });
    if (res.ok) {
      if (editingFolder) {
        setFolders(folders.map((f) => f.id === editingFolder.id ? { ...f, name: folderName, description: folderDesc } : f));
      } else {
        const data = await res.json();
        setFolders([...folders, data]);
        setSelectedFolder(data.id);
      }
    }
    setFolderModalOpen(false);
    setEditingFolder(null);
    setFolderName("");
    setFolderDesc("");
  }

  async function deleteFolder(id: string) {
    if (!confirm("Удалить папку и все фото в ней?")) return;
    await fetch("/api/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_folder", id }) });
    setFolders(folders.filter((f) => f.id !== id));
    setPhotos(photos.filter((p) => p.folder_id !== id));
    if (selectedFolder === id) setSelectedFolder(null);
  }

  // Photo upload
  async function uploadFiles(files: FileList | File[]) {
    if (!selectedFolder) { alert("Сначала выберите папку"); return; }
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder_id", selectedFolder);
      const res = await fetch("/api/gallery/upload", { method: "POST", body: fd });
      if (res.ok) {
        const photo = await res.json();
        setPhotos((prev) => [photo, ...prev]);
      }
    }
    setUploading(false);
  }

  // Clipboard paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      uploadFiles(imageFiles);
    }
  }, [selectedFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Photo actions
  async function deletePhoto(id: string) {
    if (!confirm("Удалить фото?")) return;
    await fetch("/api/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_photo", id }) });
    setPhotos(photos.filter((p) => p.id !== id));
  }

  async function savePhotoEdit() {
    if (!editingPhoto) return;
    await fetch("/api/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_photo", id: editingPhoto.id, name: photoName, description: photoDesc }) });
    setPhotos(photos.map((p) => p.id === editingPhoto.id ? { ...p, name: photoName, description: photoDesc } : p));
    setEditingPhoto(null);
  }

  async function copyImageUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyImageToClipboard(url: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback: copy URL
      copyImageUrl(url);
    }
  }

  return (
    <div className="flex gap-6" onPaste={handlePaste} tabIndex={0} style={{ outline: "none", minHeight: "60vh" }}>
      {/* Folders sidebar */}
      <div className="w-56 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase" style={{ color: "#888" }}>Папки</span>
          <button onClick={() => { setEditingFolder(null); setFolderName(""); setFolderDesc(""); setFolderModalOpen(true); }}
            className="p-1 rounded hover:bg-blue-50" title="Новая папка"><FolderPlus size={14} style={{ color: "#0067a5" }} /></button>
        </div>
        <button onClick={() => setSelectedFolder(null)}
          className="w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors"
          style={{ background: selectedFolder === null ? "#e8f4fd" : "transparent", color: selectedFolder === null ? "#0067a5" : "#333" }}>
          Все фото ({photos.length})
        </button>
        {folders.map((folder) => {
          const count = photos.filter((p) => p.folder_id === folder.id).length;
          const isSelected = selectedFolder === folder.id;
          return (
            <div key={folder.id} className="group flex items-center gap-1 mb-0.5">
              <button onClick={() => setSelectedFolder(folder.id)}
                className="flex-1 text-left px-3 py-2 rounded text-sm transition-colors truncate"
                style={{ background: isSelected ? "#e8f4fd" : "transparent", color: isSelected ? "#0067a5" : "#333" }}>
                {folder.name} <span style={{ color: "#aaa" }}>({count})</span>
              </button>
              <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
                <button onClick={() => { setEditingFolder(folder); setFolderName(folder.name); setFolderDesc(folder.description ?? ""); setFolderModalOpen(true); }}
                  className="p-1 rounded hover:bg-gray-100"><Edit2 size={11} style={{ color: "#888" }} /></button>
                <button onClick={() => deleteFolder(folder.id)}
                  className="p-1 rounded hover:bg-red-50"><Trash2 size={11} style={{ color: "#c62828" }} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Photos grid */}
      <div className="flex-1">
        {/* Upload bar */}
        {selectedFolder && (
          <div className="flex items-center gap-3 mb-4">
            <label
              className="flex items-center gap-2 px-4 py-2 rounded cursor-pointer transition-colors hover:bg-blue-50"
              style={{ border: "1px dashed #0067a5", color: "#0067a5" }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); }}>
              <Upload size={14} /> {uploading ? "Загрузка..." : "Загрузить фото"}
              <input ref={fileInputRef} type="file" accept="image/*,.pdf,.svg,.heic" multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <span className="text-xs" style={{ color: "#aaa" }}>или Ctrl+V для вставки из буфера</span>
          </div>
        )}

        {currentPhotos.length === 0 ? (
          <div className="text-center py-16" style={{ color: "#aaa" }}>
            <Image size={48} className="mx-auto mb-3" style={{ color: "#ddd" }} />
            <p className="text-sm">{selectedFolder ? "В этой папке пока нет фото" : "Выберите папку или создайте новую"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {currentPhotos.map((photo) => (
              <div key={photo.id} className="group relative rounded-lg overflow-hidden" style={{ border: "1px solid #e4e4e4", background: "#fafafa" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={photo.name ?? ""} className="w-full aspect-square object-cover cursor-pointer"
                  onClick={() => setPreviewUrl(photo.url)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    copyImageToClipboard(photo.url);
                  }} />
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                  <div className="flex gap-2">
                    <button onClick={() => copyImageToClipboard(photo.url)}
                      className="p-1.5 bg-white/90 rounded-full hover:bg-white" title="Копировать фото">
                      {copied === photo.url ? <Check size={14} style={{ color: "#2e7d32" }} /> : <Copy size={14} style={{ color: "#333" }} />}
                    </button>
                    <button onClick={() => { setEditingPhoto(photo); setPhotoName(photo.name ?? ""); setPhotoDesc(photo.description ?? ""); }}
                      className="p-1.5 bg-white/90 rounded-full hover:bg-white" title="Редактировать"><Edit2 size={14} style={{ color: "#333" }} /></button>
                    <button onClick={() => deletePhoto(photo.id)}
                      className="p-1.5 bg-white/90 rounded-full hover:bg-white" title="Удалить"><Trash2 size={14} style={{ color: "#c62828" }} /></button>
                  </div>
                </div>
                {/* Name */}
                <div className="px-2 py-1.5">
                  <p className="text-xs truncate" style={{ color: "#333" }}>{photo.name || "Без названия"}</p>
                  {photo.description && <p className="text-xs truncate" style={{ color: "#aaa" }}>{photo.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Folder create/edit modal */}
      <Modal open={folderModalOpen} onClose={() => setFolderModalOpen(false)} title={editingFolder ? "Редактировать папку" : "Новая папка"} size="sm">
        <div className="p-5 space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Название</label>
            <input value={folderName} onChange={(e) => setFolderName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Название папки" autoFocus />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Описание</label>
            <textarea value={folderDesc} onChange={(e) => setFolderDesc(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" rows={2} placeholder="Описание (необязательно)" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setFolderModalOpen(false)}>Отмена</Button>
            <Button size="sm" onClick={saveFolder}>{editingFolder ? "Сохранить" : "Создать"}</Button>
          </div>
        </div>
      </Modal>

      {/* Photo edit modal */}
      <Modal open={!!editingPhoto} onClose={() => setEditingPhoto(null)} title="Редактировать фото" size="sm">
        <div className="p-5 space-y-3">
          {editingPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={editingPhoto.url} alt="" className="w-full max-h-48 object-contain rounded" />
          )}
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Название</label>
            <input value={photoName} onChange={(e) => setPhotoName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Описание</label>
            <textarea value={photoDesc} onChange={(e) => setPhotoDesc(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setEditingPhoto(null)}>Отмена</Button>
            <Button size="sm" onClick={savePhotoEdit}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      {/* Full-size preview */}
      {previewUrl && (
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center" onClick={() => setPreviewUrl(null)}>
          <button className="absolute top-4 right-4 p-2 bg-white/20 rounded-full hover:bg-white/40" onClick={() => setPreviewUrl(null)}>
            <X size={20} style={{ color: "#fff" }} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="" className="max-w-[90vw] max-h-[90vh] object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
