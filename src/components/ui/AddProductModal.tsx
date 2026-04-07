"use client";

import { useState, useEffect } from "react";
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
  flavor?: string;
  volume?: string;
  product_variants: { id: string; attributes: Record<string, string>; price: number | null; stock: number }[];
}

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
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [basePrice, setBasePrice] = useState(0);
  const [salePrice, setSalePrice] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [lifecycleDays, setLifecycleDays] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    createClient()
      .from("products")
      .select("*, product_variants(*)")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setProducts(data ?? []));
  }, [open]);

  function selectProduct(p: Product) {
    setSelected(p);
    setVariantId(p.product_variants[0]?.id ?? "");
    const v = p.product_variants[0];
    const bp = v?.price ?? p.base_price;
    setBasePrice(bp);
    setSalePrice(String(bp));
    setDiscountPct("0");
    setQuantity(1);
  }

  function onVariantChange(vid: string) {
    setVariantId(vid);
    const v = selected?.product_variants.find((vv) => vv.id === vid);
    const bp = v?.price ?? selected?.base_price ?? 0;
    setBasePrice(bp);
    setSalePrice(String(bp));
    setDiscountPct("0");
  }

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
  const total = unitPrice * quantity;

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
        variant_id: variantId || null,
        quantity,
        base_price: basePrice,
        unit_price: unitPrice,
        discount_percent: Number(discountPct) || 0,
        total_price: total,
        product_block: productBlock,
        category: selected.category || null,
        subcategory: selected.subcategory || null,
        flavor: selected.flavor || null,
        volume: selected.volume || null,
        lifecycle_days: lifecycleDays > 0 ? lifecycleDays : null,
      })
      .select("*, products(name, sku)")
      .single();

    if (!error && data) {
      onAdded(data);
      onClose();
      setSelected(null);
    }
    setLoading(false);
  }

  const filtered = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal open={open} onClose={onClose} title="Добавить товар" size="lg">
      <div className="p-6 space-y-4">
        {!selected ? (
          <>
            <input
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Поиск по названию или артикулу..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filtered.map((p) => {
                const totalStock = p.product_variants.reduce((s, v) => s + v.stock, 0);
                return (
                  <button
                    key={p.id}
                    onClick={() => selectProduct(p)}
                    className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-400">Арт. {p.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">{formatCurrency(p.base_price)}</p>
                        <p className={`text-xs ${totalStock > 0 ? "text-green-600" : "text-red-500"}`}>
                          {totalStock > 0 ? `${totalStock} шт.` : "Нет в наличии"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Товары не найдены</p>}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{selected.name}</h3>
                <p className="text-xs text-slate-400">Арт. {selected.sku}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-blue-600 hover:underline">← Выбрать другой</button>
            </div>

            {selected.product_variants.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Вариант</label>
                <select
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={variantId}
                  onChange={(e) => onVariantChange(e.target.value)}
                >
                  {selected.product_variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(" / ")} — {v.stock} шт.
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Price section */}
            <div className="rounded-lg p-3" style={{ background: "#f8f9fa", border: "1px solid #e4e4e4" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: "#888" }}>Базовая цена (каталог)</span>
                <span className="text-sm font-semibold" style={{ color: "#888" }}>{formatCurrency(basePrice)}</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Цена продажи</label>
                  <input
                    type="number" min="0" step="0.01" value={salePrice}
                    onChange={(e) => handleSalePriceChange(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Скидка %</label>
                  <input
                    type="number" min="0" max="100" step="0.1" value={discountPct}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Кол-во</label>
                  <input
                    type="number" min="1" value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Итого</label>
                  <div className="text-lg font-bold pt-1.5" style={{ color: "#2e7d32" }}>{formatCurrency(total)}</div>
                </div>
              </div>
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
