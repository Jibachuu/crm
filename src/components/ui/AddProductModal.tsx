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
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState(0);
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
    setPrice(String(v?.price ?? p.base_price));
    setDiscount(0);
    setQuantity(1);
  }

  function onVariantChange(vid: string) {
    setVariantId(vid);
    const v = selected?.product_variants.find((vv) => vv.id === vid);
    setPrice(String(v?.price ?? selected?.base_price ?? ""));
  }

  const unitPrice = Number(price) || 0;
  const total = unitPrice * quantity * (1 - discount / 100);

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
        unit_price: unitPrice,
        discount_percent: discount,
        total_price: total,
        product_block: productBlock,
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
                      {Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(" / ")} — {v.stock} шт. в наличии
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Кол-во</label>
                <input
                  type="number" min="1" value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Цена (₽)</label>
                <input
                  type="number" min="0" step="0.01" value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Скидка (%)</label>
                <input
                  type="number" min="0" max="100" value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm text-slate-600">Итого:</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(total)}</span>
            </div>

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
