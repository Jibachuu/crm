"use client";

import { useEffect } from "react";
import { X, Download } from "lucide-react";

interface Props {
  src: string;
  alt?: string;
  downloadName?: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt, downloadName, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full"
        style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
      >
        <X size={20} />
      </button>

      {/* Download */}
      <a
        href={src}
        download={downloadName || "image"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 right-16 p-2 rounded-full"
        style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
        title="Скачать"
      >
        <Download size={20} />
      </a>

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || ""}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[95vw] max-h-[95vh] object-contain"
        style={{ cursor: "zoom-out" }}
      />
    </div>
  );
}
