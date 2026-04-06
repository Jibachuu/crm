"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import type { CustomField, EntityType, CustomFieldType } from "@/types/database";

const ENTITY_LABELS: Record<EntityType, string> = {
  lead: "Лиды", deal: "Сделки", contact: "Контакты", company: "Компании",
};

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Текст", number: "Число", date: "Дата", boolean: "Да/Нет", select: "Список",
};

const ENTITY_VARIANTS: Record<EntityType, "info" | "warning" | "success" | "purple"> = {
  lead: "info", deal: "success", contact: "warning", company: "purple",
};

export default function CustomFieldsSettings({ customFields: initial }: { customFields: CustomField[] }) {
  const [fields, setFields] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    entity_type: "lead" as EntityType,
    name: "",
    label: "",
    field_type: "text" as CustomFieldType,
    options: "",
    is_required: false,
  });

  async function createField() {
    if (!form.name || !form.label) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("custom_fields")
      .insert({
        entity_type: form.entity_type,
        name: form.name.toLowerCase().replace(/\s+/g, "_"),
        label: form.label,
        field_type: form.field_type,
        options: form.field_type === "select" ? form.options.split(",").map((s) => s.trim()).filter(Boolean) : null,
        is_required: form.is_required,
        sort_order: fields.filter((f) => f.entity_type === form.entity_type).length,
      })
      .select()
      .single();
    if (data) {
      setFields((p) => [...p, data]);
      setForm({ entity_type: "lead", name: "", label: "", field_type: "text", options: "", is_required: false });
      setShowForm(false);
    }
    if (error) console.error(error);
    setLoading(false);
  }

  async function deleteField(id: string) {
    if (!confirm("Удалить поле? Все значения будут удалены.")) return;
    const supabase = createClient();
    await supabase.from("custom_fields").delete().eq("id", id);
    setFields((p) => p.filter((f) => f.id !== id));
  }

  const grouped = (["lead", "deal", "contact", "company"] as EntityType[]).map((et) => ({
    entity: et,
    fields: fields.filter((f) => f.entity_type === et),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Кастомные поля</h2>
        <Button size="sm" onClick={() => setShowForm((p) => !p)}>
          <Plus size={16} /> Добавить поле
        </Button>
      </div>

      {showForm && (
        <Card className="mb-5">
          <CardBody>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Сущность</label>
                <select
                  value={form.entity_type}
                  onChange={(e) => setForm((p) => ({ ...p, entity_type: e.target.value as EntityType }))}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {(["lead", "deal", "contact", "company"] as EntityType[]).map((e) => (
                    <option key={e} value={e}>{ENTITY_LABELS[e]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Тип поля</label>
                <select
                  value={form.field_type}
                  onChange={(e) => setForm((p) => ({ ...p, field_type: e.target.value as CustomFieldType }))}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                    <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Название (англ., без пробелов)</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="my_field"
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Заголовок</label>
                <input
                  value={form.label}
                  onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Моё поле"
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {form.field_type === "select" && (
              <div className="mb-3">
                <label className="text-xs font-medium text-slate-600 block mb-1">Варианты (через запятую)</label>
                <input
                  value={form.options}
                  onChange={(e) => setForm((p) => ({ ...p, options: e.target.value }))}
                  placeholder="Вариант 1, Вариант 2, Вариант 3"
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_required}
                  onChange={(e) => setForm((p) => ({ ...p, is_required: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600"
                />
                Обязательное поле
              </label>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Отмена</Button>
                <Button size="sm" loading={loading} onClick={createField}>Создать</Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="space-y-5">
        {grouped.map(({ entity, fields: entityFields }) => (
          <Card key={entity}>
            <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2">
              <Badge variant={ENTITY_VARIANTS[entity]}>{ENTITY_LABELS[entity]}</Badge>
              <span className="text-sm text-slate-500">{entityFields.length} полей</span>
            </div>
            <CardBody className="p-0">
              {entityFields.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Нет кастомных полей</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-2 text-xs text-slate-500">Заголовок</th>
                      <th className="text-left px-4 py-2 text-xs text-slate-500">Название</th>
                      <th className="text-left px-4 py-2 text-xs text-slate-500">Тип</th>
                      <th className="text-left px-4 py-2 text-xs text-slate-500">Обязательное</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entityFields.map((field) => (
                      <tr key={field.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-sm font-medium text-slate-900">{field.label}</td>
                        <td className="px-4 py-2 text-xs text-slate-500 font-mono">{field.name}</td>
                        <td className="px-4 py-2">
                          <span className="text-xs text-slate-600">{FIELD_TYPE_LABELS[field.field_type]}</span>
                          {field.options && (
                            <p className="text-xs text-slate-400">{field.options.join(", ")}</p>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {field.is_required ? (
                            <Badge variant="danger">Да</Badge>
                          ) : (
                            <span className="text-xs text-slate-400">Нет</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => deleteField(field.id)}
                            className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
