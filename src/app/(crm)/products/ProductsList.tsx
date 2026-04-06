"use client";

import { useState } from "react";
import { Plus, Search, Package, Edit2, Trash2, CheckSquare } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ExportImportButtons from "@/components/ui/ExportImportButtons";
import PurgeButton from "@/components/ui/PurgeButton";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingStock, setEditingStock] = useState<Record<string, string>>({});

  const [categoryFilter, setCategoryFilter] = useState("");

  // Get unique categories
  const categories = [...new Set(products.map((p: { category?: string }) => p.category).filter(Boolean))] as string[];

  const filtered = products.filter((p: { name: string; sku: string; category?: string }) => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !categoryFilter || p.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const filteredIds = filtered.map((p: { id: string }) => p.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id: string) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => { const s = new Set(prev); filteredIds.forEach((id: string) => s.delete(id)); return s; });
    } else {
      setSelected((prev) => { const s = new Set(prev); filteredIds.forEach((id: string) => s.add(id)); return s; });
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

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
    if (!confirm("Удалить товар?")) return;
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "products", ids: [id] }),
    });
    if (res.ok) {
      setProducts((prev: typeof products) => prev.filter((p: { id: string }) => p.id !== id));
    } else {
      const d = await res.json();
      alert("Ошибка: " + (d.error ?? ""));
    }
  }

  async function bulkDelete() {
    if (!confirm(`Удалить ${selected.size} товаров?`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "products", ids }),
    });
    if (res.ok) {
      setProducts((prev) => prev.filter((p: { id: string }) => !ids.includes(p.id)));
      setSelected(new Set());
    }
    setBulkDeleting(false);
  }

  async function updateStock(productId: string, stock: number) {
    const supabase = createClient();
    // Update base stock on product_variants if exists, otherwise we'll store in description or ignore
    const product = products.find((p: { id: string }) => p.id === productId);
    if (product?.product_variants?.length > 0) {
      // Update first variant's stock
      await supabase.from("product_variants").update({ stock }).eq("id", product.product_variants[0].id);
    } else {
      // Create a default variant with the stock
      await supabase.from("product_variants").insert({
        product_id: productId,
        attributes: {},
        price: product?.base_price ?? 0,
        stock,
      });
    }
    // Reload product
    const { data } = await supabase
      .from("products")
      .select("*, product_attributes(*), product_variants(*)")
      .eq("id", productId)
      .single();
    if (data) {
      setProducts((prev: typeof products) => prev.map((p: { id: string }) => p.id === productId ? data : p));
    }
    setEditingStock((prev) => { const n = { ...prev }; delete n[productId]; return n; });
  }

  async function updateField(productId: string, field: string, value: unknown) {
    const supabase = createClient();
    await supabase.from("products").update({ [field]: value }).eq("id", productId);
    setProducts((prev: typeof products) =>
      prev.map((p: { id: string }) => p.id === productId ? { ...p, [field]: value } : p)
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию, артикулу..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none"
            style={{ border: "1px solid #d0d0d0", borderRadius: 4 }}
          />
        </div>
        {categories.length > 0 && (
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs px-2 py-1.5 rounded outline-none" style={{ border: "1px solid #d0d0d0", color: categoryFilter ? "#333" : "#888" }}>
            <option value="">Все категории</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <ExportImportButtons entity="products" onImported={() => window.location.reload()} />
        <PurgeButton table="products" onPurged={() => window.location.reload()} />
        <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus size={13} /> Новый товар
        </Button>
      </div>

      {/* Bulk actions */}
      {someSelected && (
        <div className="flex items-center gap-3 px-4 py-2 mb-3 rounded" style={{ background: "#e8f4fd", border: "1px solid #b3d4f0" }}>
          <span className="text-sm font-medium" style={{ color: "#0067a5" }}>Выбрано: {selected.size}</span>
          <button onClick={() => setSelected(new Set())} className="text-xs hover:underline" style={{ color: "#0067a5" }}>Снять</button>
          <div className="flex-1" />
          <Button size="sm" variant="danger" onClick={bulkDelete} loading={bulkDeleting}>
            <Trash2 size={13} /> Удалить
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-4 mb-3 text-xs" style={{ color: "#888" }}>
        <span>Товаров: <strong style={{ color: "#333" }}>{filtered.length}</strong></span>
      </div>

      {/* Table */}
      <div className="bg-white overflow-hidden" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
        {filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: "#aaa" }}>
            <Package size={36} className="mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm">Товары не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                  <th className="px-3 py-2.5 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer" style={{ accentColor: "#0067a5" }} />
                  </th>
                  {["Товар", "Категория", "Артикул", "Цена", "Наличие", "Статус", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#888" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((product: {
                  id: string; name: string; sku: string; base_price: number; is_active: boolean;
                  category?: string; subcategory?: string;
                  product_variants?: { id: string; stock: number }[];
                }) => {
                  const isSel = selected.has(product.id);
                  const totalStock = product.product_variants?.reduce((s, v) => s + v.stock, 0) ?? 0;
                  const isEditingStock = product.id in editingStock;
                  return (
                    <tr key={product.id} style={{ borderBottom: "1px solid #f0f0f0", background: isSel ? "#f0f7ff" : "transparent" }}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={isSel} onChange={() => toggleOne(product.id)} className="cursor-pointer" style={{ accentColor: "#0067a5" }} />
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium" style={{ color: "#333" }}>{product.name}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>
                        {product.category ? (
                          <div>
                            <span>{product.category}</span>
                            {product.subcategory && <span style={{ color: "#aaa" }}> → {product.subcategory}</span>}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>{product.sku}</td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "#333" }}>{formatCurrency(product.base_price)}</td>
                      <td className="px-4 py-2.5">
                        {isEditingStock ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              className="w-16 text-xs px-2 py-1 focus:outline-none"
                              style={{ border: "1px solid #d0d0d0", borderRadius: 3 }}
                              value={editingStock[product.id]}
                              onChange={(e) => setEditingStock((p) => ({ ...p, [product.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") updateStock(product.id, Number(editingStock[product.id]) || 0);
                                if (e.key === "Escape") setEditingStock((p) => { const n = { ...p }; delete n[product.id]; return n; });
                              }}
                              autoFocus
                            />
                            <button
                              onClick={() => updateStock(product.id, Number(editingStock[product.id]) || 0)}
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ background: "#0067a5", color: "#fff" }}
                            >OK</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingStock((p) => ({ ...p, [product.id]: String(totalStock) }))}
                            className="text-xs font-medium px-2 py-0.5 rounded hover:bg-gray-100 transition-colors"
                            style={{ color: totalStock > 0 ? "#2e7d32" : "#c62828" }}
                            title="Нажмите чтобы изменить"
                          >
                            {totalStock > 0 ? `${totalStock} шт` : "Нет"}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => updateField(product.id, "is_active", !product.is_active)}
                          title={product.is_active ? "Деактивировать" : "Активировать"}
                        >
                          <Badge variant={product.is_active ? "success" : "default"}>
                            {product.is_active ? "Активен" : "Неактивен"}
                          </Badge>
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => { setEditing(product); setModalOpen(true); }}
                            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                            title="Редактировать"
                          >
                            <Edit2 size={13} style={{ color: "#888" }} />
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="p-1.5 rounded hover:bg-red-50 transition-colors"
                            title="Удалить"
                          >
                            <Trash2 size={13} style={{ color: "#c62828" }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
