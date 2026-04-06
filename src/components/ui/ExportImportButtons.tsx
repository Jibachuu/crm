"use client";

import { useState } from "react";
import Button from "./Button";
import ImportModal from "./ImportModal";
import { Download, Upload } from "lucide-react";

interface Props {
  entity: "leads" | "deals" | "contacts" | "companies" | "products";
  onImported?: (count: number) => void;
}

export default function ExportImportButtons({ entity, onImported }: Props) {
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    const res = await fetch(`/api/export/${entity}`);
    if (!res.ok) { setExporting(false); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `${entity}_${date}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={handleExport} loading={exporting}>
        <Download size={13} /> Excel
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
        <Upload size={13} /> Импорт
      </Button>
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entity={entity}
        onImported={onImported}
      />
    </>
  );
}
