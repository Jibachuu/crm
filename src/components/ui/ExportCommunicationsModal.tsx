"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

interface Communication {
  id: string;
  channel: string;
  direction: string;
  subject?: string;
  body?: string;
  sender_name?: string;
  from_address?: string;
  created_at: string;
  users?: { full_name: string };
}

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email", telegram: "Telegram", phone: "Звонок", maks: "МАКС", note: "Заметка", internal: "Внутреннее",
};

interface Props {
  open: boolean;
  onClose: () => void;
  communications: Communication[];
  companyName: string;
}

export default function ExportCommunicationsModal({ open, onClose, communications, companyName }: Props) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [channels, setChannels] = useState<Set<string>>(new Set(["email", "telegram", "phone", "maks", "note", "internal"]));
  const [dirFilter, setDirFilter] = useState<"all" | "inbound" | "outbound">("all");
  const [generating, setGenerating] = useState(false);

  function toggleChannel(ch: string) {
    setChannels((prev) => { const s = new Set(prev); s.has(ch) ? s.delete(ch) : s.add(ch); return s; });
  }

  const filtered = communications.filter((c) => {
    if (!channels.has(c.channel)) return false;
    if (dirFilter !== "all" && c.direction !== dirFilter) return false;
    if (dateFrom && c.created_at < dateFrom) return false;
    if (dateTo && c.created_at < dateTo + "T23:59:59") return false;
    return true;
  });

  async function generateDocx() {
    setGenerating(true);

    const paragraphs: Paragraph[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: `История коммуникаций — ${companyName}`, bold: true })],
      }),
      new Paragraph({
        children: [new TextRun({
          text: `Период: ${dateFrom || "начало"} — ${dateTo || "сегодня"} | Сообщений: ${filtered.length}`,
          size: 20, color: "888888",
        })],
        spacing: { after: 300 },
      }),
    ];

    for (const comm of filtered) {
      const date = new Date(comm.created_at);
      const dateStr = date.toLocaleDateString("ru-RU") + " " + date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      const channel = CHANNEL_LABELS[comm.channel] ?? comm.channel;
      const dir = comm.direction === "inbound" ? "Входящее" : "Исходящее";
      const sender = comm.sender_name ?? comm.users?.full_name ?? comm.from_address ?? "";

      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: `[${dateStr}] `, bold: true, size: 20 }),
            new TextRun({ text: `${channel} | ${dir}`, size: 20, color: "0067a5" }),
            new TextRun({ text: sender ? ` | ${sender}` : "", size: 20, color: "888888" }),
          ],
          spacing: { before: 200 },
        })
      );

      if (comm.subject) {
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: `Тема: ${comm.subject}`, italics: true, size: 20 })],
        }));
      }

      if (comm.body) {
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: comm.body, size: 20 })],
        }));
      }

      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: "—".repeat(60), size: 16, color: "CCCCCC" })],
      }));
    }

    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Переписки_${companyName.replace(/[^a-zA-Zа-яА-Я0-9]/g, "_")}.docx`;
    a.click();
    URL.revokeObjectURL(a.href);

    setGenerating(false);
  }

  const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, outline: "none" };

  return (
    <Modal open={open} onClose={onClose} title="Экспорт переписок" size="md">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: "#888" }}>Период от</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: "#888" }}>Период до</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: "#888" }}>Каналы</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
              <label key={k} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={channels.has(k)} onChange={() => toggleChannel(k)} style={{ accentColor: "#0067a5" }} />
                {v}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: "#888" }}>Направление</label>
          <select value={dirFilter} onChange={(e) => setDirFilter(e.target.value as typeof dirFilter)} style={{ ...inputStyle, width: "100%" }}>
            <option value="all">Все</option>
            <option value="inbound">Только входящие</option>
            <option value="outbound">Только исходящие</option>
          </select>
        </div>

        <div className="p-3 rounded" style={{ background: "#f5f5f5", border: "1px solid #e4e4e4" }}>
          <p className="text-xs" style={{ color: "#666" }}>Будет экспортировано: <strong>{filtered.length}</strong> сообщений</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Отмена</Button>
          <Button size="sm" onClick={generateDocx} loading={generating} disabled={filtered.length === 0}>
            <Download size={13} /> Скачать .docx
          </Button>
        </div>
      </div>
    </Modal>
  );
}
