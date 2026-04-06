"use client";

import { useState } from "react";
import { Bot, RefreshCw, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";

interface Props {
  companyId: string;
  type: "client" | "communications";
  label: string;
}

export default function AIAnalysis({ companyId, type, label }: Props) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);

  async function analyze() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, company_id: companyId }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Ошибка");
      else { setAnalysis(data.analysis); setVisible(true); }
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button onClick={analysis ? () => setVisible(!visible) : analyze} disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors hover:bg-purple-50 disabled:opacity-50"
          style={{ border: "1px solid #7b1fa2", color: "#7b1fa2" }}>
          {loading ? <RefreshCw size={12} className="animate-spin" /> : type === "client" ? <Bot size={12} /> : <MessageSquare size={12} />}
          {loading ? "Анализ..." : label}
          {analysis && (visible ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
        </button>
        {analysis && (
          <button onClick={analyze} disabled={loading} className="text-xs hover:underline" style={{ color: "#7b1fa2" }}>
            <RefreshCw size={11} />
          </button>
        )}
      </div>

      {error && <p className="text-xs mt-2 px-3 py-1.5 rounded" style={{ background: "#fdecea", color: "#c62828" }}>{error}</p>}

      {visible && analysis && (
        <div className="mt-2 p-3 rounded text-xs whitespace-pre-wrap" style={{ background: "#f3e5f5", border: "1px solid #ce93d8", color: "#333", lineHeight: 1.6 }}>
          {analysis}
        </div>
      )}
    </div>
  );
}
