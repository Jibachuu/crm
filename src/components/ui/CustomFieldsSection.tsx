"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface CustomField {
  id: string;
  name: string;
  label: string;
  field_type: "text" | "number" | "date" | "boolean" | "select";
  options: string[] | null;
  is_required: boolean;
}

interface CustomFieldValue {
  field_id: string;
  entity_id: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_boolean: boolean | null;
}

interface Props {
  entityType: "lead" | "deal" | "contact" | "company";
  entityId: string;
}

export default function CustomFieldsSection({ entityType, entityId }: Props) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [values, setValues] = useState<Record<string, CustomFieldValue>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: fieldsData }, { data: valuesData }] = await Promise.all([
      supabase.from("custom_fields").select("*").eq("entity_type", entityType).order("sort_order"),
      supabase.from("custom_field_values").select("*").eq("entity_type", entityType).eq("entity_id", entityId),
    ]);
    setFields(fieldsData ?? []);
    const map: Record<string, CustomFieldValue> = {};
    for (const v of valuesData ?? []) {
      map[v.field_id] = v;
    }
    setValues(map);
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  async function saveValue(field: CustomField, rawValue: string) {
    setSaving((p) => ({ ...p, [field.id]: true }));
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      field_id: field.id,
      entity_type: entityType,
      entity_id: entityId,
      value_text: null,
      value_number: null,
      value_date: null,
      value_boolean: null,
    };

    if (field.field_type === "text" || field.field_type === "select") payload.value_text = rawValue || null;
    else if (field.field_type === "number") payload.value_number = rawValue ? Number(rawValue) : null;
    else if (field.field_type === "date") payload.value_date = rawValue || null;
    else if (field.field_type === "boolean") payload.value_boolean = rawValue === "true";

    await supabase.from("custom_field_values").upsert(payload, {
      onConflict: "field_id,entity_id",
    });

    setValues((p) => ({ ...p, [field.id]: payload as unknown as CustomFieldValue }));
    setSaving((p) => ({ ...p, [field.id]: false }));
  }

  function getValue(field: CustomField): string {
    const v = values[field.id];
    if (!v) return "";
    if (field.field_type === "text" || field.field_type === "select") return v.value_text ?? "";
    if (field.field_type === "number") return v.value_number != null ? String(v.value_number) : "";
    if (field.field_type === "date") return v.value_date ?? "";
    if (field.field_type === "boolean") return v.value_boolean != null ? String(v.value_boolean) : "";
    return "";
  }

  if (fields.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Дополнительные поля</h3>
      {fields.map((field) => (
        <div key={field.id}>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            {field.label}
            {field.is_required && <span className="text-red-500 ml-0.5">*</span>}
            {saving[field.id] && <span className="ml-2 text-blue-400 animate-pulse">сохранение...</span>}
          </label>

          {field.field_type === "boolean" ? (
            <select
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              defaultValue={getValue(field)}
              onBlur={(e) => saveValue(field, e.target.value)}
            >
              <option value="">—</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          ) : field.field_type === "select" && field.options?.length ? (
            <select
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              defaultValue={getValue(field)}
              onBlur={(e) => saveValue(field, e.target.value)}
            >
              <option value="">—</option>
              {field.options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              defaultValue={getValue(field)}
              onBlur={(e) => saveValue(field, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
