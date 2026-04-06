"use client";

import { useState } from "react";
import { Plus, Search, Package, Edit2, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ProductModal from "./ProductModal";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ProductsList({ initialProducts }: { initialProducts: any[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);

  const filtered = products.filter((p: { name: string; sku: string }) =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleSaved(saved: any) {
    setProducts((prev: typeof products) => {
      const idx = prev.findIndex((p: { id: string }) => p.id === saved.id);
      if (idx >= 0) { const u = [...prev]; u[idx] = saved; return u; }
      return [saved, ...prev];
    });
    setEditing(null);
    setModalOpen(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить товар? Это действие нельзя отменить.")) return;
    await createClient().from("products").delete().eq("id", id);
    setProducts((prev: typeof products) => prev.filter((p: { id: string }) => p.id !== id));
  }

  return (
    <div>
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или артикулу..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus size={16} /> Новый товар
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-4 text-center py-16">
            <Package size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-400">Товары не найдены</p>
          </div>
        ) : (
          filtered.map((product: {
            id: string; name: string; sku: string; base_price: number; is_active: boolean;
            product_variants?: { id: string; attributes: Record<string, string>; price?: number; stock: number }[];
          }) => {
            const totalStock = product.product_variants?.reduce((s, v) => s + v.stock, 0) ?? 0;
            return (
              <Card key={product.id} className="hover:shadow-md transition-shadow">
                <CardBody>
                  <div className="flex items-start justify-between mb-2">
                    <Package size={20} className="text-slate-400" />
                    <Badge variant={product.is_active ? "success" : "default"}>
                      {product.is_active ? "Активен" : "Неактивен"}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-0.5 leading-tight">{product.name}</h3>
                  <p className="text-xs text-slate-500 mb-3">Арт. {product.sku}</p>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-slate-900">{formatCurrency(product.base_price)}</span>
                    <span className={`text-xs font-medium ${totalStock > 0 ? "text-green-600" : "text-red-600"}`}>
                      {totalStock > 0 ? `${totalStock} шт.` : "Нет в наличии"}
                    </span>
                  </div>
                  {product.product_variants && product.product_variants.length > 0 && (
                    <p className="text-xs text-slate-400 mb-3">{product.product_variants.length} вариантов</p>
                  )}
                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    <Button size="sm" variant="secondary" className="flex-1"
                      onClick={() => { setEditing(product); setModalOpen(true); }}>
                      <Edit2 size={13} /> Изменить
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDelete(product.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })
        )}
      </div>

      <ProductModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        product={editing}
        onSaved={handleSaved}
      />
    </div>
  );
}
