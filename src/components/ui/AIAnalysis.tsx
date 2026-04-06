"use client";

import { useState } from "react";
import { Bot, Copy, Check, ChevronDown, ChevronUp, MessageSquare, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  companyId: string;
  type: "client" | "communications";
  label: string;
}

export default function AIAnalysis({ companyId, type, label }: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  async function gather() {
    setLoading(true);
    const supabase = createClient();

    if (type === "client") {
      const [{ data: company }, { data: deals }, { data: leads }, { data: comms }] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).single(),
        supabase.from("deals").select("title, stage, amount, created_at").eq("company_id", companyId),
        supabase.from("leads").select("title, status, created_at").eq("company_id", companyId),
        supabase.from("communications").select("channel, direction, body, created_at").eq("entity_type", "company").eq("entity_id", companyId).order("created_at", { ascending: false }).limit(50),
      ]);

      const text = `Проанализируй клиента и дай структурированный отчёт.

=== ДАННЫЕ КОМПАНИИ ===
Название: ${company?.name}
ИНН: ${company?.inn ?? "—"}
Тип: ${company?.company_type ?? "—"}
Деятельность: ${company?.activity ?? "—"}
Потребность: ${company?.need ?? "—"}
Город: ${company?.city ?? "—"}

=== СДЕЛКИ (${deals?.length ?? 0}) ===
${(deals ?? []).map((d) => `• ${d.title} | ${d.stage} | ${d.amount ?? 0} ₽ | ${new Date(d.created_at).toLocaleDateString("ru-RU")}`).join("\n") || "Нет сделок"}

=== ЛИДЫ (${leads?.length ?? 0}) ===
${(leads ?? []).map((l) => `• ${l.title} | ${l.status} | ${new Date(l.created_at).toLocaleDateString("ru-RU")}`).join("\n") || "Нет лидов"}

=== ПОСЛЕДНИЕ КОММУНИКАЦИИ (${comms?.length ?? 0}) ===
${(comms ?? []).slice(0, 30).map((c) => `[${new Date(c.created_at).toLocaleDateString("ru-RU")}] ${c.channel} ${c.direction === "inbound" ? "←" : "→"} ${(c.body ?? "").slice(0, 150)}`).join("\n") || "Нет коммуникаций"}

=== ЗАДАНИЕ ===
Дай отчёт по пунктам:
1. Краткое резюме клиента (1-2 предложения)
2. Что покупает чаще всего
3. Частота покупок и средний чек
4. Когда последний контакт
5. Риск оттока (высокий/средний/низкий) с объяснением
6. Рекомендация что предложить следующим`;

      setPrompt(text);
    }

    if (type === "communications") {
      const { data: comms } = await supabase.from("communications")
        .select("channel, direction, body, sender_name, from_address, created_at")
        .eq("entity_type", "company").eq("entity_id", companyId)
        .order("created_at", { ascending: false }).limit(100);

      const text = `Проанализируй переписки с клиентом.

=== СООБЩЕНИЯ (${comms?.length ?? 0}) ===
${(comms ?? []).map((c) => {
  const date = new Date(c.created_at).toLocaleDateString("ru-RU");
  const sender = c.sender_name ?? c.from_address ?? "";
  return `[${date}] ${c.channel} ${c.direction === "inbound" ? "←" : "→"} ${sender}: ${(c.body ?? "").slice(0, 200)}`;
}).join("\n") || "Нет сообщений"}

=== ЗАДАНИЕ ===
Дай отчёт по пунктам:
1. О чём в основном общаемся с этим клиентом
2. Тональность переписки (позитивная/нейтральная/негативная)
3. Открытые вопросы которые остались без ответа
4. Следующий рекомендуемый шаг`;

      setPrompt(text);
    }

    setVisible(true);
    setLoading(false);
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button onClick={prompt ? () => setVisible(!visible) : gather} disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors hover:bg-purple-50 disabled:opacity-50"
          style={{ border: "1px solid #7b1fa2", color: "#7b1fa2" }}>
          {loading ? <RefreshCw size={12} className="animate-spin" /> : type === "client" ? <Bot size={12} /> : <MessageSquare size={12} />}
          {loading ? "Сбор данных..." : label}
          {prompt && (visible ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
        </button>
        {prompt && (
          <button onClick={gather} disabled={loading} className="text-xs hover:underline" style={{ color: "#7b1fa2" }} title="Обновить данные">
            <RefreshCw size={11} />
          </button>
        )}
      </div>

      {visible && prompt && (
        <div className="mt-2 rounded" style={{ border: "1px solid #ce93d8" }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ background: "#f3e5f5", borderBottom: "1px solid #ce93d8" }}>
            <span className="text-xs font-medium" style={{ color: "#7b1fa2" }}>Скопируйте и вставьте в Claude</span>
            <button onClick={copyToClipboard} className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-purple-100 transition-colors"
              style={{ color: "#7b1fa2" }}>
              {copied ? <><Check size={11} /> Скопировано!</> : <><Copy size={11} /> Копировать</>}
            </button>
          </div>
          <pre className="p-3 text-xs whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: 300, color: "#333", background: "#fafafa" }}>
            {prompt}
          </pre>
        </div>
      )}
    </div>
  );
}
