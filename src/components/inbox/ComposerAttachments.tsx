"use client";

import { useEffect, useState } from "react";
import { X, FileText, Image as ImageIcon, Music, Video, File as FileIcon } from "lucide-react";

interface Props {
  files: File[];
  onRemove: (idx: number) => void;
}

// Полоска предпросмотра аттачей над composer'ом. Для картинок —
// маленькая миниатюра через FileReader; для остальных — крупная иконка
// по MIME-типу + имя + размер. Крестик убирает файл из очереди.
export default function ComposerAttachments({ files, onRemove }: Props) {
  if (files.length === 0) return null;
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 8,
      padding: "8px 12px",
      background: "var(--tg-bg-panel-hover)",
      borderTop: "1px solid var(--tg-border-subtle)",
    }}>
      {files.map((f, i) => (
        <Preview key={i} file={f} onRemove={() => onRemove(i)} />
      ))}
    </div>
  );
}

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("audio/")) return Music;
  if (mime.startsWith("video/")) return Video;
  if (mime.startsWith("text/") || mime.includes("pdf")) return FileText;
  return FileIcon;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function Preview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    const reader = new FileReader();
    reader.onload = () => setThumb(reader.result as string);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file, isImage]);

  const name = file.name || "attachment";
  const Icon = iconFor(file.type);

  return (
    <div style={{
      position: "relative",
      display: "flex", alignItems: "center", gap: 10,
      padding: 6, paddingRight: 30,
      background: "var(--tg-bg-panel)",
      borderRadius: 8,
      minWidth: 180, maxWidth: 260,
    }}>
      {isImage && thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt={name} style={{
          width: 44, height: 44, borderRadius: 6, objectFit: "cover", flexShrink: 0,
        }} />
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: 6, flexShrink: 0,
          background: "var(--tg-accent-dim)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--tg-accent)",
        }}>
          <Icon size={22} />
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: "var(--tg-text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }} title={name}>{name}</div>
        <div style={{ fontSize: 11, color: "var(--tg-text-secondary)" }}>{formatSize(file.size)}</div>
      </div>
      <button
        onClick={onRemove}
        style={{
          position: "absolute", top: 4, right: 4,
          width: 20, height: 20, borderRadius: "50%",
          background: "var(--tg-bg-input)", color: "var(--tg-text)",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        title="Убрать"
      >
        <X size={12} />
      </button>
    </div>
  );
}
