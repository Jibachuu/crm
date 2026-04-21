"use client";

import { useState } from "react";
import { Plus, Search, Package, Edit2, Trash2, CheckSquare, ImagePlus, FileArchive } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ExportImportButtons from "@/components/ui/ExportImportButtons";
import PurgeButton from "@/components/ui/PurgeButton";
import ProductModal from "./ProductModal";
import { formatCurrency, formatLiters } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ProductsList({ initialProducts }: { initialProducts: any[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [zipUploading, setZipUploading] = useState(false);
  const [zipResult, setZipResult] = useState<{ uploaded: number; total: number; matched: { filename: string; productName: string }[]; unmatched: string[] } | null>(null);

  async function handleZipUpload(file: File) {
    setZipUploading(true);
    setZipResult(null);
    try {
      // Unzip on client side
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((f) => !f.dir);

      const matched: { filename: string; productName: string }[] = [];
      const unmatched: string[] = [];
      let uploaded = 0;

      // Process each file — upload one by one
      for (const entry of entries) {
        const filename = entry.name.split("/").pop() || entry.name;
        const ext = filename.split(".").pop()?.toLowerCase();
        if (!ext || !["jpg", "jpeg", "png", "webp", "gif", "heic", "svg"].includes(ext)) continue;

        const blob = await entry.async("blob");
        const imgFile = new File([blob], filename, { type: ext === "jpg" ? "image/jpeg" : `image/${ext}` });

        const fd = new FormData();
        fd.append("file", imgFile);
        fd.append("filename", filename);

        const res = await fetch("/api/products/upload-photo-match", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok && data.matched) {
          matched.push({ filename, productName: data.productName });
          uploaded++;
        } else {
          unmatched.push(filename);
        }
      }

      setZipResult({ uploaded, total: entries.length, matched, unmatched });
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      alert("Ошибка: " + (err instanceof Error ? err.message : "неизвестная"));
    }
    setZipUploading(false);
  }
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");

  // Get unique categories
  const categories = [...new Set(products.map((p: { category?: string }) => p.category).filter(Boolean))] as string[];

  const filtered = products.filter((p: { name: string; sku: string; category?: string; is_active: boolean }) => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !categoryFilter || p.category === categoryFilter;
    const matchActive = activeFilter === "all" || (activeFilter === "active" ? p.is_active : !p.is_active);
    return matchSearch && matchCategory && matchActive;
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
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as "all" | "active" | "inactive")}
          className="text-xs px-2 py-1.5 rounded outline-none" style={{ border: "1px solid #d0d0d0", color: activeFilter !== "all" ? "#333" : "#888" }}>
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          <option value="inactive">Неактивные</option>
        </select>
        <ExportImportButtons entity="products" onImported={() => window.location.reload()} />
        <label className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded cursor-pointer transition-colors hover:bg-blue-50"
          style={{ border: "1px solid #0067a5", color: "#0067a5" }}>
          <FileArchive size={13} /> {zipUploading ? "Загрузка..." : "Фото из ZIP"}
          <input type="file" accept=".zip" className="hidden" disabled={zipUploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleZipUpload(f); e.target.value = ""; }} />
        </label>
        <PurgeButton table="products" onPurged={() => window.location.reload()} />
        <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus size={13} /> Новый товар
        </Button>
      </div>

      {/* ZIP upload result */}
      {zipResult && (
        <div className="mb-3 p-3 rounded" style={{ background: "#e8f5e9", border: "1px solid #a5d6a7" }}>
          <p className="text-sm font-semibold" style={{ color: "#2e7d32" }}>
            Загружено: {zipResult.uploaded} из {zipResult.total} фото
          </p>
          {zipResult.unmatched.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer" style={{ color: "#e65c00" }}>Не найдены товары для {zipResult.unmatched.length} фото</summary>
              <ul className="mt-1" style={{ color: "#888" }}>
                {zipResult.unmatched.slice(0, 20).map((f, i) => <li key={i}>— {f}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Bulk actions */}
      {someSelected && (
        <div className="flex items-center gap-3 px-4 py-2 mb-3 rounded" style={{ background: "#e8f4fd", border: "1px solid #b3d4f0" }}>
          <span className="text-sm font-medium" style={{ color: "#0067a5" }}>Выбрано: {selected.size}</span>
          <button onClick={() => setSelected(new Set())} className="text-xs hover:underline" style={{ color: "#0067a5" }}>Снять</button>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={async () => {
            const ids = Array.from(selected);
            const supabase = createClient();
            await supabase.from("products").update({ is_active: false }).in("id", ids);
            setProducts((prev) => prev.map((p: { id: string; is_active: boolean }) => ids.includes(p.id) ? { ...p, is_active: false } : p));
            setSelected(new Set());
          }}>
            <CheckSquare size={13} /> Архивировать
          </Button>
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
                  {["Фото", "Товар", "Категория", "Вид", "Литры", "Тара", "Артикул", "Цена", "Наличие", "Статус", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#888" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((product: {
                  id: string; name: string; sku: string; base_price: number; is_active: boolean;
                  category?: string; subcategory?: string; image_url?: string;
                  liters?: string; container?: string; stock?: number;
                }) => {
                  const isSel = selected.has(product.id);
                  return (
                    <tr key={product.id} style={{ borderBottom: "1px solid #f0f0f0", background: isSel ? "#f0f7ff" : "transparent" }}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={isSel} onChange={() => toggleOne(product.id)} className="cursor-pointer" style={{ accentColor: "#0067a5" }} />
                      </td>
                      <td className="px-2 py-2">
                        {product.image_url ? (
                          <label className="relative group cursor-pointer block w-10 h-10">
                            <img src={product.image_url} alt="" className="w-10 h-10 rounded object-cover" style={{ border: "1px solid #e0e0e0" }} />
                            <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <ImagePlus size={12} style={{ color: "#fff" }} />
                            </div>
                            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                              const f = e.target.files?.[0]; if (!f) return;
                              const fd = new FormData(); fd.append("file", f); fd.append("product_id", product.id);
                              const res = await fetch("/api/products/upload-image", { method: "POST", body: fd });
                              if (res.ok) { const { url } = await res.json(); setProducts((prev: typeof products) => prev.map((p: { id: string }) => p.id === product.id ? { ...p, image_url: url } : p)); }
                            }} />
                          </label>
                        ) : (
                          <label className="w-10 h-10 rounded flex items-center justify-center cursor-pointer hover:bg-gray-100" style={{ background: "#f5f5f5", border: "1px dashed #ccc" }}>
                            <ImagePlus size={14} style={{ color: "#aaa" }} />
                            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                              const f = e.target.files?.[0]; if (!f) return;
                              const fd = new FormData(); fd.append("file", f); fd.append("product_id", product.id);
                              const res = await fetch("/api/products/upload-image", { method: "POST", body: fd });
                              if (res.ok) { const { url } = await res.json(); setProducts((prev: typeof products) => prev.map((p: { id: string }) => p.id === product.id ? { ...p, image_url: url } : p)); }
                            }} />
                          </label>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium" style={{ color: "#333" }}>{product.name}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>{product.category || "—"}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>{product.subcategory || "—"}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>{formatLiters(product.liters) || "—"}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>{product.container || "—"}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>{product.sku}</td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "#333" }}>{formatCurrency(product.base_price)}</td>
                      <td className="px-4 py-2.5">
                        <input type="number" defaultValue={product.stock ?? 0}
                          onBlur={async (e) => {
                            const val = Number(e.target.value) || 0;
                            if (val === (product.stock ?? 0)) return;
                            await updateField(product.id, "stock", val);
                          }}
                          className="w-16 text-xs text-right px-2 py-1 rounded outline-none"
                          style={{ border: "1px solid #e0e0e0", color: (product.stock ?? 0) > 0 ? "#2e7d32" : "#c62828" }} />
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
