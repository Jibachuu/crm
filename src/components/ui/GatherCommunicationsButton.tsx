"use client";

import { useState } from "react";
import { Download, Copy, Check, RefreshCw, FileText } from "lucide-react";

interface Props {
  companyId: string;
  companyName: string;
}

export default function GatherCommunicationsButton({ companyId, companyName }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({ total: 0, channels: "" });

  async function gather() {
    setLoading(true);
    try {
      const res = await fetch("/api/communications/gather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Ошибка"); setLoading(false); return; }

      // Format as document
      const lines: string[] = [
        `═══════════════════════════════════════`,
        `ИСТОРИЯ КОММУНИКАЦИЙ — ${data.company}`,
        `═══════════════════════════════════════`,
        `Дата сбора: ${new Date().toLocaleDateString("ru-RU")} ${new Date().toLocaleTimeString("ru-RU")}`,
        `Сообщений: ${data.total}`,
        "",
        "КОНТАКТЫ:",
        ...data.contacts.map((c: { name: string; email?: string; telegram?: string; phone?: string }) =>
          `  • ${c.name}${c.email ? " | " + c.email : ""}${c.telegram ? " | TG: " + c.telegram : ""}${c.phone ? " | " + c.phone : ""}`
        ),
        "",
        "═══════════════════════════════════════",
        "ПЕРЕПИСКИ",
        "═══════════════════════════════════════",
        "",
      ];

      const channelLabels: Record<string, string> = {
        email: "Email", telegram: "Telegram", phone: "Звонок", maks: "МАКС", note: "Заметка", internal: "Внутреннее",
      };
      const channels = new Set<string>();

      for (const item of data.timeline) {
        const date = new Date(item.date);
        const dateStr = date.toLocaleDateString("ru-RU") + " " + date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        const ch = channelLabels[item.channel] ?? item.channel;
        const dir = item.direction === "inbound" ? "←" : "→";
        channels.add(ch);

        lines.push(`[${dateStr}] ${ch} ${dir} ${item.sender}`);
        if (item.text) lines.push(item.text);
        lines.push("---");
        lines.push("");
      }

      const doc = lines.join("\n");
      setResult(doc);
      setStats({ total: data.total, channels: [...channels].join(", ") });
    } catch (e) { alert(String(e)); }
    setLoading(false);
  }

  async function copyAll() {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadTxt() {
    const blob = new Blob([result], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Переписки_${companyName.replace(/[^a-zA-Zа-яА-Я0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <button onClick={gather} disabled={loading}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors hover:bg-green-50 disabled:opacity-50"
        style={{ border: "1px solid #2e7d32", color: "#2e7d32" }}>
        {loading ? <RefreshCw size={12} className="animate-spin" /> : <FileText size={12} />}
        {loading ? "Сбор из всех каналов..." : "Собрать все переписки"}
      </button>

      {result && (
        <div className="mt-2 rounded" style={{ border: "1px solid #2e7d32" }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ background: "#e8f5e9", borderBottom: "1px solid #2e7d32" }}>
            <span className="text-xs" style={{ color: "#2e7d32" }}>
              Собрано {stats.total} сообщений ({stats.channels})
            </span>
            <div className="flex items-center gap-2">
              <button onClick={copyAll} className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-green-100" style={{ color: "#2e7d32" }}>
                {copied ? <><Check size={11} /> Скопировано!</> : <><Copy size={11} /> Копировать</>}
              </button>
              <button onClick={downloadTxt} className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-green-100" style={{ color: "#2e7d32" }}>
                <Download size={11} /> .txt
              </button>
            </div>
          </div>
          <pre className="p-3 text-xs whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: 300, color: "#333", background: "#fafafa" }}>
            {result.slice(0, 3000)}{result.length > 3000 ? `\n\n... (ещё ${result.length - 3000} символов — скачайте полный файл)` : ""}
          </pre>
        </div>
      )}
    </div>
  );
}
