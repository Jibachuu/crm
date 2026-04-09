"use client";

import { useState } from "react";
import { Upload, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

const DEFAULT_MANAGERS = "Лилия, Якимова, Лилия Якимова, Якимова Лилия, Милана, Идрисова, Рустем, Галиев";

interface CsvRow {
  [key: string]: string;
}

export default function ImportCommunications() {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [managers, setManagers] = useState(DEFAULT_MANAGERS);
  const [skipInternal, setSkipInternal] = useState(true);
  const [skipSystem, setSkipSystem] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[]; totalDeals: number } | null>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n");
      if (lines.length < 2) return;

      // Parse CSV - handle both comma and semicolon delimiters
      const delimiter = lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));

      const parsed: CsvRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""));
        const row: CsvRow = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
        parsed.push(row);
      }
      setRows(parsed);
    };
    reader.readAsText(file, "utf-8");
  }

  const uniqueEntities = [...new Set(rows.map((r) => r["ENTITY_ID"] || r.entity_id).filter(Boolean))];
  const dateRange = rows.length > 0 ? {
    from: rows.reduce((min, r) => { const d = r["Дата добавления"] || r.date || ""; return d < min ? d : min; }, "z"),
    to: rows.reduce((max, r) => { const d = r["Дата добавления"] || r.date || ""; return d > max ? d : max; }, ""),
  } : null;

  async function startImport() {
    setImporting(true);
    setProgress(0);
    setResult(null);

    const batchSize = 100;
    let totalImported = 0, totalSkipped = 0;
    const allErrors: string[] = [];
    let totalDeals = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      try {
        const res = await fetch("/api/import/communications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: batch,
            managerNames: managers.split(",").map((m) => m.trim()).filter(Boolean),
            skipInternal,
            skipSystem,
          }),
        });
        const data = await res.json();
        totalImported += data.imported ?? 0;
        totalSkipped += data.skipped ?? 0;
        if (data.errors?.length) allErrors.push(...data.errors);
        totalDeals = Math.max(totalDeals, data.totalDeals ?? 0);
      } catch (e) {
        allErrors.push(`Batch ${i}: ${e}`);
      }
      setProgress(Math.min(i + batchSize, rows.length));
    }

    setResult({ imported: totalImported, skipped: totalSkipped, errors: allErrors, totalDeals });
    setImporting(false);
  }

  return (
    <Card>
      <CardBody>
        <h3 className="text-sm font-semibold mb-2" style={{ color: "#333" }}>Импорт переписок из Битрикс24</h3>
        <p className="text-xs mb-4" style={{ color: "#888" }}>
          CSV с колонками: Идентификатор, ENTITY_ID, Дата добавления, Автор, Текст комментария
        </p>

        {/* Step 1: Upload */}
        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm px-4 py-2 rounded cursor-pointer hover:bg-slate-50 transition-colors"
            style={{ border: "1px dashed #d0d0d0" }}>
            <Upload size={14} style={{ color: "#0067a5" }} />
            {fileName || "Загрузить CSV файл"}
            <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>

        {/* Preview */}
        {rows.length > 0 && (
          <div className="mb-4 p-3 rounded-lg text-sm space-y-1" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
            <p><strong>{rows.length}</strong> строк</p>
            <p><strong>{uniqueEntities.length}</strong> уникальных сделок (ENTITY_ID)</p>
            {dateRange && <p>Период: {dateRange.from?.slice(0, 10)} — {dateRange.to?.slice(0, 10)}</p>}
          </div>
        )}

        {/* Step 2: Settings */}
        {rows.length > 0 && (
          <div className="mb-4 space-y-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Имена менеджеров (для определения исходящих)</label>
              <input value={managers} onChange={(e) => setManagers(e.target.value)}
                className="w-full text-sm px-3 py-1.5 rounded focus:outline-none" style={{ border: "1px solid #d0d0d0" }}
                placeholder="Лилия, Якимова, Милана..." />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={skipInternal} onChange={(e) => setSkipInternal(e.target.checked)} style={{ accentColor: "#0067a5" }} />
              Пропускать внутренние комментарии
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={skipSystem} onChange={(e) => setSkipSystem(e.target.checked)} style={{ accentColor: "#0067a5" }} />
              Пропускать системные сообщения (=== SYSTEM WZ ===)
            </label>
          </div>
        )}

        {/* Step 3: Import */}
        {rows.length > 0 && !result && (
          <Button onClick={startImport} loading={importing} disabled={importing}>
            {importing ? `Обработано ${progress} из ${rows.length}` : "Начать импорт"}
          </Button>
        )}

        {/* Progress */}
        {importing && (
          <div className="mt-3">
            <div className="w-full rounded-full h-2" style={{ background: "#e0e0e0" }}>
              <div className="h-2 rounded-full transition-all" style={{ background: "#0067a5", width: `${(progress / rows.length) * 100}%` }} />
            </div>
            <p className="text-xs mt-1" style={{ color: "#888" }}>{progress} / {rows.length}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "#e8f5e9" }}>
              <CheckCircle size={16} style={{ color: "#2e7d32" }} />
              <span className="text-sm" style={{ color: "#2e7d32" }}>Импортировано: <strong>{result.imported}</strong> сообщений</span>
            </div>
            {result.skipped > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "#fff3e0" }}>
                <AlertCircle size={16} style={{ color: "#e65c00" }} />
                <span className="text-sm" style={{ color: "#e65c00" }}>Пропущено: <strong>{result.skipped}</strong></span>
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="p-3 rounded-lg" style={{ background: "#fdecea" }}>
                <div className="flex items-center gap-2 mb-2">
                  <XCircle size={16} style={{ color: "#c62828" }} />
                  <span className="text-sm font-medium" style={{ color: "#c62828" }}>Ошибки ({result.errors.length}):</span>
                </div>
                <div className="max-h-40 overflow-y-auto text-xs" style={{ color: "#c62828" }}>
                  {result.errors.slice(0, 20).map((e, i) => <p key={i}>{e}</p>)}
                  {result.errors.length > 20 && <p>...и ещё {result.errors.length - 20}</p>}
                </div>
              </div>
            )}
            <p className="text-xs" style={{ color: "#888" }}>Найдено сделок: {result.totalDeals}</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
