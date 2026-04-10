"use client";

import { useState } from "react";
import { History } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

export default function BackfillMaxHistory() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ chatsProcessed: number; totalMessages: number; totalInserted: number; errors?: string[] } | null>(null);

  async function handleBackfill() {
    if (!confirm("Загрузить всю историю переписок МАКС в CRM? Может занять до 5 минут.")) return;
    setLoading(true);
    setResult(null);
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 290000);
      const res = await fetch("/api/max/backfill-history", { method: "POST", signal: ctrl.signal });
      clearTimeout(timeoutId);
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data.ok) setResult(data);
        else alert("Ошибка: " + (data.error ?? text.slice(0, 200)));
      } catch {
        alert("Операция запущена. Проверьте переписки через несколько минут.");
      }
    } catch (e) {
      alert("Запрос отправлен. " + String(e));
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 mb-2">
          <History size={16} style={{ color: "#0067a5" }} />
          <h3 className="text-sm font-semibold" style={{ color: "#333" }}>Загрузить историю МАКС</h3>
        </div>
        <p className="text-xs mb-4" style={{ color: "#888" }}>
          Загрузит до 2000 сообщений из каждого MAX-чата (включая те, что были до подключения CRM) и сохранит их в коммуникации лидов/контактов. Дублей не будет — повторный запуск только догрузит новое.
        </p>
        <Button onClick={handleBackfill} loading={loading}>
          <History size={14} /> Загрузить историю
        </Button>
        {result && (
          <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: "#e8f5e9", color: "#2e7d32" }}>
            Чатов обработано: <strong>{result.chatsProcessed}</strong>, сообщений всего: <strong>{result.totalMessages}</strong>, сохранено новых: <strong>{result.totalInserted}</strong>
            {result.errors && result.errors.length > 0 && (
              <div className="mt-2 text-xs" style={{ color: "#c62828" }}>
                <strong>Ошибки ({result.errors.length}):</strong>
                <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto font-mono" style={{ fontSize: 10 }}>
                  {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
