"use client";

import { useState } from "react";
import { Bot, X, Copy, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function AIChatPanel() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState("");

  const queries = [
    { label: "Статистика сделок за месяц", key: "deals_month" },
    { label: "Статистика сделок за квартал", key: "deals_quarter" },
    { label: "Топ-10 товаров по продажам", key: "top_products" },
    { label: "Воронка лидов", key: "leads_funnel" },
    { label: "Топ менеджеров по выручке", key: "top_managers" },
  ];

  async function gather(key: string) {
    setLoading(true);
    setSelectedQuery(key);
    const supabase = createClient();

    let text = "";

    if (key === "deals_month" || key === "deals_quarter") {
      const days = key === "deals_month" ? 30 : 90;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data: deals } = await supabase.from("deals").select("title, stage, amount, source, created_at, users!deals_assigned_to_fkey(full_name)").gte("created_at", since);
      const stages: Record<string, number> = {};
      let total = 0, wonAmt = 0, wonCnt = 0;
      for (const d of deals ?? []) {
        stages[d.stage] = (stages[d.stage] ?? 0) + 1;
        total += d.amount ?? 0;
        if (d.stage === "won") { wonCnt++; wonAmt += d.amount ?? 0; }
      }
      text = `Проанализируй статистику сделок за ${days} дней.

=== СДЕЛКИ (${deals?.length ?? 0}) ===
По стадиям: ${Object.entries(stages).map(([k, v]) => `${k}: ${v}`).join(", ")}
Общая сумма: ${total.toLocaleString("ru-RU")} ₽
Выигранных: ${wonCnt} на сумму ${wonAmt.toLocaleString("ru-RU")} ₽
Средний чек: ${wonCnt ? Math.round(wonAmt / wonCnt).toLocaleString("ru-RU") : 0} ₽

Детали:
${(deals ?? []).map((d) => `• ${d.title} | ${d.stage} | ${d.amount ?? 0} ₽ | ${((d.users as unknown) as { full_name: string } | null)?.full_name ?? "—"}`).join("\n")}

Дай краткий анализ: тренды, проблемы, рекомендации.`;
    }

    if (key === "top_products") {
      const { data } = await supabase.from("deal_products").select("quantity, total_price, products(name, sku)");
      const map = new Map<string, { name: string; qty: number; revenue: number }>();
      for (const dp of data ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = (Array.isArray(dp.products) ? dp.products[0] : dp.products) as any;
        if (!p) continue;
        const curr = map.get(p.name) ?? { name: p.name, qty: 0, revenue: 0 };
        map.set(p.name, { ...curr, qty: curr.qty + (dp.quantity ?? 0), revenue: curr.revenue + (dp.total_price ?? 0) });
      }
      const sorted = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
      text = `Проанализируй топ товаров по продажам.

=== ТОП-10 ТОВАРОВ ===
${sorted.map((p, i) => `${i + 1}. ${p.name} — ${p.qty} шт, ${p.revenue.toLocaleString("ru-RU")} ₽`).join("\n")}

Дай анализ: какие товары лидируют, какие отстают, рекомендации по ассортименту.`;
    }

    if (key === "leads_funnel") {
      const { data: leads } = await supabase.from("leads").select("status, source, created_at");
      const statuses: Record<string, number> = {};
      for (const l of leads ?? []) statuses[l.status] = (statuses[l.status] ?? 0) + 1;
      const total = leads?.length ?? 0;
      const converted = statuses["converted"] ?? 0;
      text = `Проанализируй воронку лидов.

=== ВОРОНКА ЛИДОВ (${total}) ===
${Object.entries(statuses).map(([k, v]) => `${k}: ${v} (${total ? Math.round(v / total * 100) : 0}%)`).join("\n")}
Конверсия: ${total ? Math.round(converted / total * 100) : 0}%

Дай анализ: где теряются лиды, рекомендации по улучшению конверсии.`;
    }

    if (key === "top_managers") {
      const { data: deals } = await supabase.from("deals").select("amount, stage, users!deals_assigned_to_fkey(full_name)").eq("stage", "won");
      const map = new Map<string, { count: number; revenue: number }>();
      for (const d of deals ?? []) {
        const name = ((d.users as unknown) as { full_name: string } | null)?.full_name ?? "—";
        const curr = map.get(name) ?? { count: 0, revenue: 0 };
        map.set(name, { count: curr.count + 1, revenue: curr.revenue + (d.amount ?? 0) });
      }
      const sorted = Array.from(map.entries()).sort((a, b) => b[1].revenue - a[1].revenue);
      text = `Проанализируй менеджеров по выручке.

=== МЕНЕДЖЕРЫ (выигранные сделки) ===
${sorted.map(([name, s], i) => `${i + 1}. ${name} — ${s.count} сделок, ${s.revenue.toLocaleString("ru-RU")} ₽`).join("\n")}

Дай анализ: кто лучший, кому нужна помощь, рекомендации.`;
    }

    setResult(text);
    setLoading(false);
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110"
          style={{ background: "linear-gradient(135deg, #0067a5, #5b57d1)", color: "#fff" }}
          title="Аналитика для Claude">
          <Bot size={22} />
        </button>
      )}

      {open && (
        <div className="fixed top-0 right-0 z-50 h-full flex flex-col shadow-2xl" style={{ width: 400, background: "#fff", borderLeft: "1px solid #e4e4e4" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "linear-gradient(135deg, #0067a5, #5b57d1)" }}>
            <div className="flex items-center gap-2">
              <Bot size={18} style={{ color: "#fff" }} />
              <span className="text-sm font-semibold text-white">Данные для Claude</span>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-white/20"><X size={16} style={{ color: "#fff" }} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: "#f8f9fa" }}>
            <p className="text-xs" style={{ color: "#888" }}>Выберите отчёт — данные будут собраны из CRM. Скопируйте и вставьте в ваш Claude для анализа.</p>

            {queries.map((q) => (
              <button key={q.key} onClick={() => gather(q.key)} disabled={loading}
                className="w-full text-left text-xs px-3 py-2.5 rounded transition-colors hover:bg-blue-50 disabled:opacity-50"
                style={{ border: `1px solid ${selectedQuery === q.key && result ? "#0067a5" : "#e4e4e4"}`, color: "#333", background: selectedQuery === q.key && result ? "#e8f4fd" : "#fff" }}>
                {q.label}
              </button>
            ))}

            {loading && (
              <div className="flex items-center gap-2 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs" style={{ color: "#888" }}>Сбор данных...</span>
              </div>
            )}

            {result && (
              <div className="rounded" style={{ border: "1px solid #0067a5" }}>
                <div className="flex items-center justify-between px-3 py-2" style={{ background: "#e8f4fd", borderBottom: "1px solid #0067a5" }}>
                  <span className="text-xs font-medium" style={{ color: "#0067a5" }}>Готово! Скопируйте в Claude</span>
                  <button onClick={copyToClipboard} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded font-medium transition-colors hover:bg-blue-100"
                    style={{ color: "#0067a5" }}>
                    {copied ? <><Check size={12} /> Скопировано!</> : <><Copy size={12} /> Копировать</>}
                  </button>
                </div>
                <pre className="p-3 text-xs whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: 400, color: "#333", background: "#fff" }}>{result}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
