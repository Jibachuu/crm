"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ProductModal({ open, onClose, product, onSaved }: { open: boolean; onClose: () => void; product?: any; onSaved: (p: any) => void }) {
  const isEdit = !!product;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(product?.category ?? "");
  const [subcategory, setSubcategory] = useState(product?.subcategory ?? "");
  const [liters, setLiters] = useState(product?.liters ?? "");
  const [container, setContainer] = useState(product?.container ?? "");
  const [autoName, setAutoName] = useState(!isEdit);
  const [name, setName] = useState(product?.name ?? "");

  // Suggestions from existing products
  const [suggestions, setSuggestions] = useState<{ categories: string[]; subcategories: string[]; liters: string[]; containers: string[] }>({ categories: [], subcategories: [], liters: [], containers: [] });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("products").select("category, subcategory, liters, container").limit(2000);
      if (!data) return;
      const uniq = (key: keyof typeof data[0]) => [...new Set(data.map((r) => r[key]).filter(Boolean) as string[])].sort();
      setSuggestions({
        categories: uniq("category"),
        subcategories: uniq("subcategory"),
        liters: uniq("liters"),
        containers: uniq("container"),
      });
    })();
  }, [open]);

  function buildName(overrides?: { category?: string; subcategory?: string; liters?: string; container?: string }) {
    const c = overrides?.category ?? category;
    const s = overrides?.subcategory ?? subcategory;
    const l = overrides?.liters ?? liters;
    const co = overrides?.container ?? container;
    const lv = l ? (/(мл|л)$/i.test(String(l).trim()) ? l : `${l}л`) : "";
    return [c, s, lv, co].filter(Boolean).join(" ");
  }

  function updatePart(field: "category" | "subcategory" | "liters" | "container", value: string) {
    if (field === "category") setCategory(value);
    if (field === "subcategory") setSubcategory(value);
    if (field === "liters") setLiters(value);
    if (field === "container") setContainer(value);
    if (autoName) setName(buildName({ [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    const payload = {
      sku: fd.get("sku") as string,
      name: fd.get("name") as string,
      category: category || null,
      subcategory: subcategory || null,
      liters: liters || null,
      container: container || null,
      description: (fd.get("description") as string) || null,
      base_price: Number(fd.get("base_price")) || 0,
      stock: Number(fd.get("stock")) || 0,
      is_active: isEdit ? product.is_active : true,
    };

    // Route through admin API — RLS on products only lets admin INSERT/UPDATE
    // directly. Backlog v5 §1.2.2.
    const res = isEdit
      ? await fetch("/api/products", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: product.id, ...payload }),
        })
      : await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    const data = await res.json();
    if (!res.ok) { setError(data.error || `HTTP ${res.status}`); setLoading(false); return; }

    onSaved(data.product);
    onClose();
    setLoading(false);
  }

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Редактировать товар" : "Новый товар"} size="lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Категория</label>
            <input list="cat-list" value={category} onChange={(e) => updatePart("category", e.target.value)}
              className={inputCls} placeholder="Косметика, Держатели, Флаконы..." />
            <datalist id="cat-list">{suggestions.categories.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Вид</label>
            <input list="sub-list" value={subcategory} onChange={(e) => updatePart("subcategory", e.target.value)}
              className={inputCls} placeholder="Мыло, Настольные, Black pepper..." />
            <datalist id="sub-list">{suggestions.subcategories.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Литры</label>
            <input list="liters-list" value={liters} onChange={(e) => updatePart("liters", e.target.value)}
              className={inputCls} placeholder="5, 10..." />
            <datalist id="liters-list">{suggestions.liters.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Тара</label>
            <input list="container-list" value={container} onChange={(e) => updatePart("container", e.target.value)}
              className={inputCls} placeholder="флакон 250мл, канистра..." />
            <datalist id="container-list">{suggestions.containers.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Название товара</label>
            <input name="name" value={name} onChange={(e) => { setName(e.target.value); setAutoName(false); }} required
              className={inputCls} placeholder="Формируется автоматически" />
          </div>
          <label className="flex items-center gap-1.5 mt-5 text-xs cursor-pointer" style={{ color: "#888" }}>
            <input type="checkbox" checked={autoName} onChange={(e) => { setAutoName(e.target.checked); if (e.target.checked) setName(buildName()); }}
              style={{ accentColor: "#0067a5" }} />
            Авто
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Артикул (SKU)" name="sku" defaultValue={product?.sku} required placeholder="АРТ-001" />
          <Input label="Цена за 1 шт (₽)" name="base_price" type="number" defaultValue={product?.base_price ?? ""} min="0" step="0.01" />
          <Input label="Наличие (шт)" name="stock" type="number" defaultValue={product?.stock ?? 0} min="0" />
        </div>

        <Textarea label="Описание" name="description" defaultValue={product?.description ?? ""} />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>{isEdit ? "Сохранить" : "Создать товар"}</Button>
        </div>
      </form>
    </Modal>
  );
}
