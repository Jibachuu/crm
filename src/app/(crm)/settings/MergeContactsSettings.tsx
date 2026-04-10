"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

export default function MergeContactsSettings() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ merged: number; groups: number; errors: string[] } | null>(null);

  async function handleMerge() {
    if (!confirm("Объединить все контакты с одинаковыми телефонами?")) return;
    setLoading(true);
    setResult(null);
    try {
      // Long operation, no JSON parsing — just check status
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 120000);
      const res = await fetch("/api/merge-contacts", { method: "POST", signal: ctrl.signal });
      clearTimeout(timeoutId);
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data.ok) setResult(data);
        else alert("Ошибка: " + (data.error ?? text.slice(0, 200)));
      } catch {
        alert("Операция запущена. Проверьте контакты через минуту.");
      }
    } catch (e) {
      alert("Запрос отправлен. Проверьте контакты через 1-2 минуты.");
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardBody>
        <h3 className="text-sm font-semibold mb-2" style={{ color: "#333" }}>Объединение дубликатов контактов</h3>
        <p className="text-xs mb-4" style={{ color: "#888" }}>
          Найдёт контакты с одинаковыми номерами телефонов и объединит их в один. Лиды, сделки, задачи и переписки автоматически перепривяжутся.
        </p>
        <Button onClick={handleMerge} loading={loading}>
          <Users size={14} /> Объединить дубликаты
        </Button>
        {result && (
          <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: "#e8f5e9", color: "#2e7d32" }}>
            Объединено <strong>{result.merged}</strong> дубликатов из {result.groups} групп
            {result.errors?.length > 0 && (
              <div className="mt-2 text-xs" style={{ color: "#c62828" }}>
                Ошибок: {result.errors.length}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
