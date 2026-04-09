"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

const SOURCE_OPTIONS = [
  { value: "website", label: "Сайт" },
  { value: "referral", label: "Рекомендация" },
  { value: "cold_call", label: "Холодный звонок" },
  { value: "social", label: "Соцсети" },
  { value: "event", label: "Мероприятие" },
  { value: "other", label: "Другое" },
];

interface Funnel { id: string; name: string; is_default: boolean; }
interface FunnelStage { id: string; funnel_id: string; name: string; slug: string; sort_order: number; }

interface CreateLeadModalProps {
  open: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onCreated: (lead: any) => void;
}

export default function CreateLeadModal({ open, onClose, users, onCreated }: CreateLeadModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [selectedFunnel, setSelectedFunnel] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase.from("funnels").select("id, name, is_default").eq("type", "lead").order("is_default", { ascending: false }).then(({ data }) => {
      const f = data ?? [];
      setFunnels(f);
      const def = f.find((x) => x.is_default) ?? f[0];
      if (def) setSelectedFunnel(def.id);
    });
  }, [open]);

  useEffect(() => {
    if (!selectedFunnel) return;
    const supabase = createClient();
    supabase.from("funnel_stages").select("id, funnel_id, name, slug, sort_order").eq("funnel_id", selectedFunnel).order("sort_order").then(({ data }) => {
      setStages(data ?? []);
    });
  }, [selectedFunnel]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // First stage of selected funnel
    const firstStage = stages.find((s) => s.sort_order === Math.min(...stages.map((x) => x.sort_order)));

    const payload = {
      title: fd.get("title") as string,
      source: (fd.get("source") as string) || null,
      status: "new" as const,
      description: (fd.get("description") as string) || null,
      assigned_to: (fd.get("assigned_to") as string) || null,
      created_by: user.id,
      funnel_id: selectedFunnel || null,
      stage_id: firstStage?.id || null,
      stage_changed_at: new Date().toISOString(),
    };

    const { data, error: err } = await supabase
      .from("leads")
      .insert(payload)
      .select(`*, contacts(id, full_name), companies(id, name), users!leads_assigned_to_fkey(id, full_name)`)
      .single();

    if (err) {
      setError(err.message);
    } else {
      onCreated(data);
    }
    setLoading(false);
  }

  const userOptions = users.map((u) => ({ value: u.id, label: u.full_name ?? u.email }));

  return (
    <Modal open={open} onClose={onClose} title="Новый лид" size="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        {/* Funnel selector */}
        {funnels.length > 1 && (
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Воронка</label>
            <div className="flex gap-2">
              {funnels.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFunnel(f.id)}
                  className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: selectedFunnel === f.id ? "#0067a5" : "#f5f5f5",
                    color: selectedFunnel === f.id ? "#fff" : "#666",
                    border: selectedFunnel === f.id ? "2px solid #0067a5" : "2px solid #e0e0e0",
                  }}
                >
                  {f.name.replace(/Воронка [АБ] — /, "")}
                </button>
              ))}
            </div>
          </div>
        )}

        <Input label="Название лида" name="title" placeholder="Например: Запрос на поставку" required />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Источник" name="source" options={SOURCE_OPTIONS} placeholder="Выберите источник" />
          <Select
            label="Ответственный"
            name="assigned_to"
            options={userOptions}
            placeholder="Выберите сотрудника"
          />
        </div>
        <Textarea label="Описание" name="description" placeholder="Дополнительная информация..." />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>Создать лид</Button>
        </div>
      </form>
    </Modal>
  );
}
