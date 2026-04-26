"use client";

import { useState } from "react";

export default function DownloadPdfButton({ filename }: { filename: string }) {
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    const btnBar = document.getElementById("pdf-buttons");
    let imagesPatched: HTMLImageElement[] = [];
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const content = document.getElementById("quote-content");
      if (!content) { alert("Контент для PDF не найден"); return; }

      // Hide button bar during capture
      if (btnBar) btnBar.style.display = "none";

      // Force crossOrigin="anonymous" on images so CORS-friendly hosts
      // (Supabase storage with proper headers) get rendered. Foreign
      // images without the right headers will skip via allowTaint
      // instead of aborting the whole PDF.
      const imgs = Array.from(content.querySelectorAll("img")) as HTMLImageElement[];
      imagesPatched = imgs.filter((img) => !img.crossOrigin);
      for (const img of imagesPatched) img.crossOrigin = "anonymous";

      const canvas = await html2canvas(content, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 15000,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Simple multi-page: slice by fixed page height
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${filename}.pdf`);
    } catch (e) {
      console.error("PDF generation error:", e);
      const msg = e instanceof Error ? e.message : String(e);
      // Tainted-canvas error happens when an <img> didn't send CORS
      // headers — surface a friendlier hint than the raw browser text.
      const friendly = /tainted|cross-?origin|canvas/i.test(msg)
        ? "Не удалось создать PDF из-за изображения с другого домена. Попробуйте удалить картинку или открыть КП в режиме печати браузера (Ctrl+P)."
        : `Ошибка при создании PDF: ${msg}`;
      alert(friendly);
    } finally {
      for (const img of imagesPatched) img.removeAttribute("crossorigin");
      if (btnBar) btnBar.style.display = "";
      setLoading(false);
    }
  }

  return (
    <button onClick={download} disabled={loading}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 24px", background: "#3d3325", color: "#fff", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
      {loading ? "Генерация PDF..." : "⬇ Скачать PDF"}
    </button>
  );
}
