"use client";

import { useState } from "react";

export default function DownloadPdfButton({ filename }: { filename: string }) {
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      // Hide the button bar during capture
      const btnBar = document.getElementById("pdf-buttons");
      if (btnBar) btnBar.style.display = "none";

      const content = document.getElementById("quote-content");
      if (!content) { setLoading(false); return; }

      const canvas = await html2canvas(content, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
      });

      if (btnBar) btnBar.style.display = "";

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = -(imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${filename}.pdf`);
    } catch (e) {
      console.error(e);
      // Fallback to print
      window.print();
    }
    setLoading(false);
  }

  return (
    <button onClick={download} disabled={loading}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 24px", background: "#3d3325", color: "#fff", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
      {loading ? "Генерация PDF..." : "⬇ Скачать PDF"}
    </button>
  );
}
