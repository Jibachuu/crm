"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

interface Attribute { name: string; values: string }
interface Variant { id?: string; attributes: Record<string, string>; price: string; stock: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ProductModal({ open, onClose, product, onSaved }: { open: boolean; onClose: () => void; product?: any; onSaved: (p: any) => void }) {
  const isEdit = !!product;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(product?.category ?? "");
  const [subcategory, setSubcategory] = useState(product?.subcategory ?? "");
  const [kind, setKind] = useState(product?.kind ?? "");
  const [liters, setLiters] = useState(product?.liters ?? "");
  const [container, setContainer] = useState(product?.container ?? "");
  const [autoName, setAutoName] = useState(!isEdit);
  const [name, setName] = useState(product?.name ?? "");
  const showVolumeFlavor = ["Косметика", "Аромажидкость", "косметика", "аромажидкость"].some((c) => category.toLowerCase().includes(c.toLowerCase()));

  // Auto-generate name from parts
  function buildName() {
    return [category, subcategory, kind, liters ? `${liters}л` : "", container].filter(Boolean).join(" ");
  }
  // Update name when parts change (only in auto mode)
  function updatePart(setter: (v: string) => void, value: string) {
    setter(value);
    if (autoName) {
      // We need to compute with the new value, so we do it after setState
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement>('input[name="name"]');
        if (el) {
          const parts = [
            setter === setCategory ? value : category,
            setter === setSubcategory ? value : subcategory,
            setter === setKind ? value : kind,
            (setter === setLiters ? value : liters) ? `${setter === setLiters ? value : liters}л` : "",
            setter === setContainer ? value : container,
          ].filter(Boolean).join(" ");
          setName(parts);
        }
      }, 0);
    }
  }
  const [attributes, setAttributes] = useState<Attribute[]>(
    product?.product_attributes?.map((a: { name: string; values: string[] }) => ({ name: a.name, values: a.values.join(", ") })) ?? []
  );
  const [variants, setVariants] = useState<Variant[]>(
    product?.product_variants?.map((v: { id: string; attributes: Record<string, string>; price: number; stock: number }) => ({
      id: v.id,
      attributes: v.attributes,
      price: String(v.price ?? ""),
      stock: String(v.stock ?? 0),
    })) ?? []
  );

  function addAttribute() {
    setAttributes((p) => [...p, { name: "", values: "" }]);
  }

  function removeAttribute(i: number) {
    setAttributes((p) => p.filter((_, idx) => idx !== i));
  }

  function generateVariants() {
    const parsed = attributes
      .filter((a) => a.name && a.values)
      .map((a) => ({ name: a.name, values: a.values.split(",").map((v) => v.trim()).filter(Boolean) }));

    if (parsed.length === 0) { setVariants([]); return; }

    function cartesian(arrs: string[][]): string[][] {
      return arrs.reduce<string[][]>((acc, arr) => acc.flatMap((a) => arr.map((b) => [...a, b])), [[]]);
    }

    const combos = cartesian(parsed.map((a) => a.values));
    const newVariants: Variant[] = combos.map((combo) => {
      const attrs: Record<string, string> = {};
      parsed.forEach((a, i) => { attrs[a.name] = combo[i]; });
      // try to preserve existing price/stock
      const existing = variants.find((v) => JSON.stringify(v.attributes) === JSON.stringify(attrs));
      return { attributes: attrs, price: existing?.price ?? "", stock: existing?.stock ?? "0" };
    });
    setVariants(newVariants);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();

    const payload = {
      sku: fd.get("sku") as string,
      name: fd.get("name") as string,
      category: (fd.get("category") as string) || null,
      subcategory: (fd.get("subcategory") as string) || null,
      kind: (fd.get("kind") as string) || null,
      liters: (fd.get("liters") as string) || null,
      container: (fd.get("container") as string) || null,
      description: (fd.get("description") as string) || null,
      base_price: Number(fd.get("base_price")) || 0,
      volume_ml: fd.get("volume_ml") ? Number(fd.get("volume_ml")) : null,
      flavor: (fd.get("flavor") as string) || null,
      is_active: isEdit ? product.is_active : true,
    };

    let savedProduct;
    if (isEdit) {
      const { data, error: err } = await supabase.from("products").update(payload).eq("id", product.id).select("*").single();
      if (err) { setError(err.message); setLoading(false); return; }
      savedProduct = data;
    } else {
      const { data, error: err } = await supabase.from("products").insert(payload).select("*").single();
      if (err) { setError(err.message); setLoading(false); return; }
      savedProduct = data;
    }

    // Save attributes
    await supabase.from("product_attributes").delete().eq("product_id", savedProduct.id);
    const validAttrs = attributes.filter((a) => a.name && a.values);
    if (validAttrs.length > 0) {
      await supabase.from("product_attributes").insert(
        validAttrs.map((a) => ({
          product_id: savedProduct.id,
          name: a.name,
          values: a.values.split(",").map((v) => v.trim()).filter(Boolean),
        }))
      );
    }

    // Save variants
    if (variants.length > 0) {
      // delete old variants that are not in new list
      const existingIds = variants.filter((v) => v.id).map((v) => v.id);
      if (isEdit) {
        await supabase.from("product_variants").delete().eq("product_id", savedProduct.id)
          .not("id", "in", existingIds.length ? `(${existingIds.join(",")})` : "('')");
      }

      for (const v of variants) {
        const varPayload = {
          product_id: savedProduct.id,
          attributes: v.attributes,
          price: v.price ? Number(v.price) : null,
          stock: Number(v.stock) || 0,
        };
        if (v.id) {
          await supabase.from("product_variants").update(varPayload).eq("id", v.id);
        } else {
          await supabase.from("product_variants").insert(varPayload);
        }
      }
    } else if (isEdit) {
      await supabase.from("product_variants").delete().eq("product_id", savedProduct.id);
    }

    const { data: full } = await supabase
      .from("products")
      .select("*, product_attributes(*), product_variants(*)")
      .eq("id", savedProduct.id)
      .single();

    onSaved(full);
    onClose();
    setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Редактировать товар" : "Новый товар"} size="lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Категория</label>
            <input name="category" value={category} onChange={(e) => updatePart(setCategory, e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Косметика, Держатели, Флаконы..." />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Подкатегория</label>
            <input name="subcategory" value={subcategory} onChange={(e) => updatePart(setSubcategory, e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Мыло, Настольные..." />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Вид</label>
            <input name="kind" value={kind} onChange={(e) => updatePart(setKind, e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Black pepper, Т-образный..." />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Литры</label>
            <input name="liters" value={liters} onChange={(e) => updatePart(setLiters, e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="5, 10..." />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Тара</label>
            <input name="container" value={container} onChange={(e) => updatePart(setContainer, e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="флакон 250мл, канистра..." />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Название товара</label>
            <input name="name" value={name} onChange={(e) => { setName(e.target.value); setAutoName(false); }} required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Формируется автоматически" />
          </div>
          <label className="flex items-center gap-1.5 mt-5 text-xs cursor-pointer" style={{ color: "#888" }}>
            <input type="checkbox" checked={autoName} onChange={(e) => { setAutoName(e.target.checked); if (e.target.checked) setName(buildName()); }}
              style={{ accentColor: "#0067a5" }} />
            Авто
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Артикул (SKU)" name="sku" defaultValue={product?.sku} required placeholder="АРТ-001" />
          <Input label="Цена за 1 шт (₽)" name="base_price" type="number" defaultValue={product?.base_price ?? ""} min="0" step="0.01" />
        </div>
        {showVolumeFlavor && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Объём (мл)" name="volume_ml" type="number" defaultValue={product?.volume_ml ?? ""} placeholder="1000" min="0" />
            <Input label="Аромат" name="flavor" defaultValue={product?.flavor ?? ""} placeholder="Роза, Ваниль..." />
          </div>
        )}
        <Textarea label="Описание" name="description" defaultValue={product?.description ?? ""} />

        {/* Attributes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700">Характеристики</h3>
            <Button type="button" size="sm" variant="secondary" onClick={addAttribute}>
              <Plus size={14} /> Добавить
            </Button>
          </div>
          <p className="text-xs text-slate-400 mb-3">Пример: Объём — 1л, 5л / Аромат — Роза, Ваниль</p>
          {attributes.map((attr, i) => (
            <div key={i} className="grid grid-cols-5 gap-2 mb-2 items-end">
              <div className="col-span-2">
                <input
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Название (напр. Объём)"
                  value={attr.name}
                  onChange={(e) => setAttributes((p) => p.map((a, idx) => idx === i ? { ...a, name: e.target.value } : a))}
                />
              </div>
              <div className="col-span-2">
                <input
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Значения через запятую"
                  value={attr.values}
                  onChange={(e) => setAttributes((p) => p.map((a, idx) => idx === i ? { ...a, values: e.target.value } : a))}
                />
              </div>
              <Button type="button" size="sm" variant="danger" onClick={() => removeAttribute(i)}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          {attributes.length > 0 && (
            <Button type="button" size="sm" variant="secondary" onClick={generateVariants}>
              Сгенерировать варианты
            </Button>
          )}
        </div>

        {/* Variants */}
        {variants.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Варианты ({variants.length})</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {variants.map((v, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex-1 text-sm text-slate-700">
                    {Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(" / ")}
                  </div>
                  <input
                    type="number"
                    placeholder="Цена"
                    className="w-24 text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={v.price}
                    onChange={(e) => setVariants((p) => p.map((vv, idx) => idx === i ? { ...vv, price: e.target.value } : vv))}
                  />
                  <input
                    type="number"
                    placeholder="Остаток"
                    className="w-20 text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={v.stock}
                    onChange={(e) => setVariants((p) => p.map((vv, idx) => idx === i ? { ...vv, stock: e.target.value } : vv))}
                  />
                  <span className="text-xs text-slate-400 w-16 text-right">
                    {v.price ? formatCurrency(Number(v.price)) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>{isEdit ? "Сохранить" : "Создать товар"}</Button>
        </div>
      </form>
    </Modal>
  );
}
