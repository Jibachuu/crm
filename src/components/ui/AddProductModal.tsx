"use client";

import { useState, useEffect } from "react";
import { Trash2, Plus } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  sku: string;
  base_price: number;
  category?: string;
  subcategory?: string;
  liters?: string;
  container?: string;
}

interface ItemVariant { label: string; price: number; quantity: number; sum: number; image_url?: string }

interface Props {
  open: boolean;
  onClose: () => void;
  entityType: "lead" | "deal";
  entityId: string;
  productBlock?: "request" | "order";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAdded: (item: any) => void;
}

export default function AddProductModal({ open, onClose, entityType, entityId, productBlock = "request", onAdded }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [basePrice, setBasePrice] = useState(0);
  const [salePrice, setSalePrice] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [lifecycleDays, setLifecycleDays] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [variants, setVariants] = useState<ItemVariant[]>([]);

  useEffect(() => {
    if (!open) return;
    createClient()
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setProducts(data ?? []));
  }, [open]);

  function selectProduct(p: Product) {
    setSelected(p);
    const bp = p.base_price;
    setBasePrice(bp);
    setSalePrice(String(bp));
    setDiscountPct("0");
    setQuantity(1);
    setVariants([]);
  }

  const isBottle = (selected?.category || "").toLowerCase().includes("флакон")
    || (selected?.subcategory || "").toLowerCase().includes("флакон");

  function addBottleVariants() {
    if (!selected) return;
    const bp = basePrice;
    setVariants([
      { label: "Без УФ печати", price: bp, quantity: 1, sum: bp },
      { label: "С УФ печатью", price: bp + 500, quantity: 1, sum: bp + 500 },
      { label: "С УФ печатью и нашим лого", price: Math.round((bp + 500) * 0.6), quantity: 1, sum: Math.round((bp + 500) * 0.6) },
      { label: "С наклейкой", price: bp + 100, quantity: 1, sum: bp + 100 },
      { label: "С наклейкой и нашим лого", price: Math.round((bp + 100) * 0.6), quantity: 1, sum: Math.round((bp + 100) * 0.6) },
    ]);
  }

  function addCustomVariant() {
    setVariants((prev) => [...prev, { label: "Новый вариант", price: basePrice, quantity: 1, sum: basePrice }]);
  }

  function updateVariant(idx: number, field: keyof ItemVariant, val: string | number) {
    setVariants((prev) => prev.map((v, i) => {
      if (i !== idx) return v;
      const next = { ...v, [field]: val };
      if (field === "price" || field === "quantity") {
        next.sum = (Number(next.price) || 0) * (Number(next.quantity) || 0);
      }
      return next;
    }));
  }

  function removeVariant(idx: number) {
    setVariants((prev) => prev.filter((_, i) => i !== idx));
  }

  const variantsTotal = variants.reduce((a, v) => a + (Number(v.sum) || 0), 0);
  const variantsQty = variants.reduce((a, v) => a + (Number(v.quantity) || 0), 0);

  // Sale price changed → recalculate discount
  function handleSalePriceChange(val: string) {
    setSalePrice(val);
    const sp = Number(val) || 0;
    if (basePrice > 0) {
      const disc = Math.round(((basePrice - sp) / basePrice) * 1000) / 10;
      setDiscountPct(String(Math.max(0, disc)));
    }
  }

  // Discount changed → recalculate sale price
  function handleDiscountChange(val: string) {
    setDiscountPct(val);
    const disc = Number(val) || 0;
    const sp = Math.round(basePrice * (1 - disc / 100) * 100) / 100;
    setSalePrice(String(Math.max(0, sp)));
  }

  const unitPrice = Number(salePrice) || 0;
  const hasVariants = variants.length > 0;
  const total = hasVariants ? variantsTotal : unitPrice * quantity;
  const effectiveQty = hasVariants ? variantsQty : quantity;

  async function handleAdd() {
    if (!selected) return;
    setLoading(true);
    const supabase = createClient();
    const table = entityType === "lead" ? "lead_products" : "deal_products";
    const fkField = entityType === "lead" ? "lead_id" : "deal_id";

    const { data, error } = await supabase
      .from(table)
      .insert({
        [fkField]: entityId,
        product_id: selected.id,
        variant_id: null,
        quantity: effectiveQty,
        base_price: basePrice,
        unit_price: unitPrice,
        discount_percent: Number(discountPct) || 0,
        total_price: total,
        product_block: productBlock,
        category: selected.category || null,
        subcategory: selected.subcategory || null,
        lifecycle_days: lifecycleDays > 0 ? lifecycleDays : null,
        variants: hasVariants ? variants : [],
      })
      .select("*, products(name, sku, image_url)")
      .single();

    if (!error && data) {
      onAdded(data);
      onClose();
      setSelected(null);
      setVariants([]);
    } else if (error) {
      console.error("[AddProductModal] insert failed:", error);
      alert("Не удалось добавить товар: " + error.message);
    }
    setLoading(false);
  }

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) || p.subcategory?.toLowerCase().includes(q);
  });

  return (
    <Modal open={open} onClose={onClose} title="Добавить товар" size="lg">
      <div className="p-6 space-y-4">
        {!selected ? (
          <>
            <input
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Поиск по названию, артикулу или категории..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProduct(p)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-400">Арт. {p.sku}</p>
                      {(p.category || p.subcategory) && (
                        <p className="text-xs" style={{ color: "#0067a5" }}>{[p.category, p.subcategory].filter(Boolean).join(" → ")}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(p.base_price)}</p>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Товары не найдены</p>}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{selected.name}</h3>
                <p className="text-xs text-slate-400">Арт. {selected.sku}</p>
                {(selected.category || selected.subcategory) && (
                  <p className="text-xs mt-0.5" style={{ color: "#0067a5" }}>{[selected.category, selected.subcategory].filter(Boolean).join(" → ")}</p>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-blue-600 hover:underline">← Выбрать другой</button>
            </div>

            {/* Price section */}
            <div className="rounded-lg p-3" style={{ background: "#f8f9fa", border: "1px solid #e4e4e4" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: "#888" }}>Базовая цена (каталог)</span>
                <span className="text-sm font-semibold" style={{ color: "#888" }}>{formatCurrency(basePrice)}</span>
              </div>
              <div className={`grid gap-3 ${hasVariants ? "grid-cols-3" : "grid-cols-4"}`}>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Цена продажи</label>
                  <input
                    type="number" min="0" step="0.01" value={salePrice}
                    disabled={hasVariants}
                    onChange={(e) => handleSalePriceChange(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Скидка %</label>
                  <input
                    type="number" min="0" max="100" step="0.1" value={discountPct}
                    disabled={hasVariants}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
                {!hasVariants && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Кол-во</label>
                    <input
                      type="number" min="1" value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Итого {hasVariants && <span className="font-normal text-slate-400">(варианты)</span>}</label>
                  <div className="text-lg font-bold pt-1.5" style={{ color: "#2e7d32" }}>{formatCurrency(total)}</div>
                </div>
              </div>
            </div>

            {/* Variants section */}
            <div className="rounded-lg p-3" style={{ background: "#fffaf0", border: "1px solid #ffe0b2" }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-semibold" style={{ color: "#e65c00" }}>Варианты комплектации</p>
                  <p className="text-xs" style={{ color: "#bf7600" }}>
                    {isBottle
                      ? "Флакон: можно добавить УФ печать, наклейку, логотип и т.д."
                      : "Добавьте опции/комплектации — каждая со своей ценой и количеством"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {isBottle && variants.length === 0 && (
                    <button
                      type="button"
                      onClick={addBottleVariants}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-orange-50 transition-colors"
                      style={{ color: "#e65c00", borderColor: "#ffcc80" }}
                    >
                      + 5 вариантов флакона
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={addCustomVariant}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-orange-50 transition-colors flex items-center gap-1"
                    style={{ color: "#e65c00", borderColor: "#ffcc80" }}
                  >
                    <Plus size={12} /> Свой вариант
                  </button>
                </div>
              </div>

              {variants.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  <div className="grid gap-2 px-1" style={{ gridTemplateColumns: "1fr 100px 80px 100px 32px", fontSize: 11, color: "#bf7600", fontWeight: 500 }}>
                    <span>Название</span>
                    <span className="text-right">Цена</span>
                    <span className="text-right">Кол-во</span>
                    <span className="text-right">Сумма</span>
                    <span />
                  </div>
                  {variants.map((v, i) => (
                    <div key={i} className="grid gap-2 items-center" style={{ gridTemplateColumns: "1fr 100px 80px 100px 32px" }}>
                      <input
                        type="text"
                        value={v.label}
                        onChange={(e) => updateVariant(i, "label", e.target.value)}
                        className="text-sm border border-orange-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                      <input
                        type="number" min="0" step="0.01" value={v.price}
                        onChange={(e) => updateVariant(i, "price", Number(e.target.value) || 0)}
                        className="text-sm text-right border border-orange-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                      <input
                        type="number" min="1" value={v.quantity}
                        onChange={(e) => updateVariant(i, "quantity", Number(e.target.value) || 1)}
                        className="text-sm text-right border border-orange-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                      <div className="text-sm text-right font-semibold" style={{ color: "#2e7d32" }}>{formatCurrency(v.sum)}</div>
                      <button
                        type="button"
                        onClick={() => removeVariant(i)}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded p-1 transition-colors"
                        title="Удалить вариант"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 mt-2 border-t" style={{ borderColor: "#ffe0b2" }}>
                    <span className="text-xs" style={{ color: "#bf7600" }}>Всего вариантов: {variants.length} · {variantsQty} шт</span>
                    <span className="text-sm font-bold" style={{ color: "#2e7d32" }}>{formatCurrency(variantsTotal)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Lifecycle days — only for Косметика */}
            {selected.category?.toLowerCase().includes("косметик") && productBlock === "order" && (
              <div className="rounded-lg p-3" style={{ background: "#fff3e0", border: "1px solid #ffe0b2" }}>
                <label className="block text-xs font-medium mb-1" style={{ color: "#e65c00" }}>Цикл жизни (дней)</label>
                <input type="number" min="0" value={lifecycleDays}
                  onChange={(e) => setLifecycleDays(Number(e.target.value))}
                  className="w-24 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="90" />
                <p className="text-xs mt-1" style={{ color: "#bf7600" }}>Через {lifecycleDays || "N"} дней после сделки МОП получит задачу связаться с клиентом</p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>Отмена</Button>
              <Button onClick={handleAdd} loading={loading}>Добавить</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
