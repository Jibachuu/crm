"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

export default function SyncMaxContactsSettings() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ chatsScanned: number; createdContacts: number; updatedNames: number; updatedAvatars: number; backfilledFromComms?: number; errors?: string[] } | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/max/sync-contacts", { method: "POST" });
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data.ok) setResult(data);
        else alert("Ошибка: " + (data.error ?? text.slice(0, 200)));
      } catch {
        alert("Не удалось разобрать ответ. Возможно, операция ещё идёт.");
      }
    } catch (e) {
      alert("Запрос отправлен. Проверьте контакты через минуту. " + String(e));
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardBody>
        <h3 className="text-sm font-semibold mb-2" style={{ color: "#333" }}>Синхронизация МАКС → контакты</h3>
        <p className="text-xs mb-4" style={{ color: "#888" }}>
          Скачает имена, юзернеймы и аватарки из всех чатов МАКС, сохранит в контакты и в Supabase Storage. Аватарки будут видны всегда, даже если VPS перезапустится.
        </p>
        <Button onClick={handleSync} loading={loading}>
          <RefreshCw size={14} /> Синхронизировать МАКС
        </Button>
        {result && (
          <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: "#e8f5e9", color: "#2e7d32" }}>
            Чатов: <strong>{result.chatsScanned}</strong>, новых контактов: <strong>{result.createdContacts}</strong>, имён обновлено: <strong>{result.updatedNames}</strong>, аватарок загружено: <strong>{result.updatedAvatars}</strong>{typeof result.backfilledFromComms === "number" && <>, имён из переписок: <strong>{result.backfilledFromComms}</strong></>}
            {result.errors && result.errors.length > 0 && (
              <div className="mt-2 text-xs" style={{ color: "#c62828" }}>
                <strong>Ошибки ({result.errors.length}):</strong>
                <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto font-mono" style={{ fontSize: 10 }}>
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
