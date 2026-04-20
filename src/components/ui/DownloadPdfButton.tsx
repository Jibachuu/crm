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
      const scale = imgWidth / canvas.width;

      // Find safe break points — gaps between top-level sections (children of content)
      const breakPoints: number[] = [0]; // pixel positions where we can break
      const children = content.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        const bottom = child.offsetTop + child.offsetHeight;
        breakPoints.push(bottom);
        // Also check nested product cards for finer breaks
        const cards = child.querySelectorAll("[style*='page-break-inside']");
        cards.forEach((card) => {
          const el = card as HTMLElement;
          const cardBottom = el.offsetTop + el.offsetHeight;
          breakPoints.push(cardBottom);
        });
      }
      breakPoints.sort((a, b) => a - b);
      // De-duplicate and filter
      const uniqueBreaks = [...new Set(breakPoints)].filter((bp) => bp > 0);

      // Slice into pages, never cutting through a section
      const pageHeightPx = pageHeight / scale;
      let currentY = 0; // current position in source pixels

      while (currentY < canvas.height) {
        if (currentY > 0) pdf.addPage();

        // Find the best break point that fits within one page
        let bestBreak = currentY + pageHeightPx;
        // Only look for break points if we'd go past a page
        if (bestBreak < canvas.height) {
          // Find the last break point that fits
          let found = currentY;
          for (const bp of uniqueBreaks) {
            const bpScaled = bp * 2; // scale: 2
            if (bpScaled <= currentY) continue;
            if (bpScaled <= currentY + pageHeightPx * 2) found = bpScaled;
            else break;
          }
          if (found > currentY) bestBreak = found / 2;
        }

        const sliceHeight = Math.min(bestBreak - currentY, pageHeightPx);
        const sliceHeightMm = sliceHeight * scale;

        // Draw the slice from the full canvas
        const position = -(currentY * scale);
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);

        currentY += sliceHeight;
      }

      pdf.save(`${filename}.pdf`);
    } catch (e) {
      console.error(e);
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
