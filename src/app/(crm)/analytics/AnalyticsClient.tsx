"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Download, Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import * as XLSX from "xlsx";

type DataTab = "companies" | "deals" | "leads" | "deal_products";

const TABS: { key: DataTab; label: string }[] = [
  { key: "companies", label: "Компании" },
  { key: "deals", label: "Сделки" },
  { key: "leads", label: "Лиды" },
  { key: "deal_products", label: "Товары в сделках" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface ColDef {
  key: string;
  label: string;
  render?: (v: unknown, row: Row) => React.ReactNode;
}

const COMPANY_COLS: ColDef[] = [
  { key: "name", label: "Название" },
  { key: "venue_type", label: "Тип заведения", render: (_, r) => r.venue_types?.name ?? "—" },
  { key: "supplier", label: "Поставщик", render: (_, r) => r.suppliers?.name ?? "—" },
  { key: "inn", label: "ИНН" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "bathrooms_count", label: "Санузлов" },
  { key: "rooms_count", label: "Номеров" },
  { key: "masters_count", label: "Мест мастеров" },
  { key: "ltv", label: "LTV", render: (v) => v ? formatCurrency(v as number) : "—" },
  { key: "deals_count", label: "Сделок" },
  { key: "created_at", label: "Создана", render: (v) => formatDate(v as string) },
];

const DEAL_COLS: ColDef[] = [
  { key: "title", label: "Название" },
  { key: "company", label: "Компания", render: (_, r) => r.companies?.name ?? "—" },
  { key: "contact", label: "Контакт", render: (_, r) => r.contacts?.full_name ?? "—" },
  { key: "stage", label: "Стадия" },
  { key: "amount", label: "Сумма", render: (v) => v ? formatCurrency(v as number) : "—" },
  { key: "source", label: "Источник" },
  { key: "objections", label: "Возражения" },
  { key: "assigned", label: "Ответственный", render: (_, r) => r.users?.full_name ?? "—" },
  { key: "created_at", label: "Создана", render: (v) => formatDate(v as string) },
];

const LEAD_COLS: ColDef[] = [
  { key: "title", label: "Название" },
  { key: "company", label: "Компания", render: (_, r) => r.companies?.name ?? "—" },
  { key: "contact", label: "Контакт", render: (_, r) => r.contacts?.full_name ?? "—" },
  { key: "status", label: "Статус" },
  { key: "source", label: "Источник" },
  { key: "assigned", label: "Ответственный", render: (_, r) => r.users?.full_name ?? "—" },
  { key: "created_at", label: "Создан", render: (v) => formatDate(v as string) },
];

const PRODUCT_COLS: ColDef[] = [
  { key: "company", label: "Компания", render: (_, r) => r.deals?.companies?.name ?? "—" },
  { key: "deal", label: "Сделка", render: (_, r) => r.deals?.title ?? "—" },
  { key: "product", label: "Товар", render: (_, r) => r.products?.name ?? "—" },
  { key: "sku", label: "Артикул", render: (_, r) => r.products?.sku ?? "—" },
  { key: "product_block", label: "Блок", render: (v) => v === "order" ? "Заказ" : "Запрос" },
  { key: "quantity", label: "Кол-во" },
  { key: "unit_price", label: "Цена", render: (v) => formatCurrency(v as number) },
  { key: "discount_percent", label: "Скидка %", render: (v) => v ? `${v}%` : "—" },
  { key: "total_price", label: "Сумма", render: (v) => formatCurrency(v as number) },
  { key: "created_at", label: "Дата", render: (v) => formatDate(v as string) },
];

const COLS: Record<DataTab, ColDef[]> = {
  companies: COMPANY_COLS,
  deals: DEAL_COLS,
  leads: LEAD_COLS,
  deal_products: PRODUCT_COLS,
};

export default function AnalyticsDataSets() {
  const [activeTab, setActiveTab] = useState<DataTab>("companies");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    loadData(activeTab);
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setSortCol("");
    setPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function loadData(tab: DataTab) {
    setLoading(true);
    const sb = createClient();
    let data: Row[] = [];

    if (tab === "companies") {
      const { data: companies } = await sb
        .from("companies")
        .select("*, venue_types(name), suppliers(name), users!companies_assigned_to_fkey(full_name)")
        .order("name");

      // Fetch deal stats per company
      const { data: dealStats } = await sb
        .from("deals")
        .select("company_id, amount, stage");

      const companyMap = new Map<string, { ltv: number; count: number }>();
      for (const d of dealStats ?? []) {
        if (!d.company_id) continue;
        const curr = companyMap.get(d.company_id) ?? { ltv: 0, count: 0 };
        companyMap.set(d.company_id, {
          ltv: curr.ltv + (d.stage === "won" ? (d.amount ?? 0) : 0),
          count: curr.count + 1,
        });
      }

      data = (companies ?? []).map((c) => ({
        ...c,
        ltv: companyMap.get(c.id)?.ltv ?? 0,
        deals_count: companyMap.get(c.id)?.count ?? 0,
      }));
    } else if (tab === "deals") {
      const { data: deals } = await sb
        .from("deals")
        .select("*, companies(name), contacts(full_name), users!deals_assigned_to_fkey(full_name)")
        .order("created_at", { ascending: false });
      data = deals ?? [];
    } else if (tab === "leads") {
      const { data: leads } = await sb
        .from("leads")
        .select("*, companies(name), contacts(full_name), users!leads_assigned_to_fkey(full_name)")
        .order("created_at", { ascending: false });
      data = leads ?? [];
    } else if (tab === "deal_products") {
      const { data: dp } = await sb
        .from("deal_products")
        .select("*, products(name, sku), deals(title, companies(name))")
        .order("created_at", { ascending: false });
      data = dp ?? [];
    }

    setRows(data);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let r = rows;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((row) =>
        Object.values(row).some((v) =>
          typeof v === "string" ? v.toLowerCase().includes(q) :
          typeof v === "object" && v !== null
            ? Object.values(v).some((vv) => typeof vv === "string" && vv.toLowerCase().includes(q))
            : false
        )
      );
    }
    if (dateFrom) r = r.filter((row) => row.created_at && row.created_at >= dateFrom);
    if (dateTo) r = r.filter((row) => row.created_at && row.created_at <= dateTo + "T23:59:59");
    if (sortCol) {
      r = [...r].sort((a, b) => {
        const va = a[sortCol] ?? "";
        const vb = b[sortCol] ?? "";
        const cmp = String(va).localeCompare(String(vb), "ru", { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, search, dateFrom, dateTo, sortCol, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const cols = COLS[activeTab];

  function handleSort(key: string) {
    if (sortCol === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(key);
      setSortDir("asc");
    }
  }

  function exportXlsx() {
    const colDefs = COLS[activeTab];
    const exportRows = filtered.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of colDefs) {
        out[col.label] = col.render ? String(col.render(row[col.key], row) ?? "").replace(/<[^>]*>/g, "") : row[col.key] ?? "";
      }
      return out;
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, activeTab);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Dataset tabs */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: "1px solid #e4e4e4" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setPage(1); }}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              borderBottom: activeTab === t.key ? "2px solid #0067a5" : "2px solid transparent",
              color: activeTab === t.key ? "#0067a5" : "#666",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Поиск..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none"
            style={{ border: "1px solid #d0d0d0", borderRadius: 4 }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "#888" }}>Период:</span>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="text-sm px-2 py-1.5 focus:outline-none" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
          <span className="text-xs" style={{ color: "#888" }}>—</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="text-sm px-2 py-1.5 focus:outline-none" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        <Button size="sm" variant="secondary" onClick={exportXlsx}>
          <Download size={13} /> Excel ({filtered.length})
        </Button>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center text-sm" style={{ color: "#aaa" }}>Загрузка...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: "#aaa" }}>Нет данных</div>
          ) : (
            <table className="w-full text-sm" style={{ minWidth: 800 }}>
              <thead>
                <tr style={{ background: "#fafafa", borderBottom: "1px solid #e4e4e4" }}>
                  {cols.map((col) => (
                    <th
                      key={col.key}
                      className="text-left px-4 py-2 text-xs font-medium cursor-pointer select-none whitespace-nowrap"
                      style={{ color: "#888" }}
                      onClick={() => handleSort(col.key)}
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        {sortCol === col.key
                          ? sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />
                          : <ChevronsUpDown size={11} className="opacity-30" />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={row.id ?? i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    {cols.map((col) => (
                      <td key={col.key} className="px-4 py-2 text-xs whitespace-nowrap max-w-48 truncate" style={{ color: "#444" }}>
                        {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid #e4e4e4" }}>
            <span className="text-xs" style={{ color: "#888" }}>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} из {filtered.length}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 text-xs disabled:opacity-40"
                style={{ border: "1px solid #d0d0d0", borderRadius: 4 }}
              >
                ←
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className="px-3 py-1 text-xs"
                    style={{
                      border: "1px solid #d0d0d0",
                      borderRadius: 4,
                      background: p === page ? "#0067a5" : "#fff",
                      color: p === page ? "#fff" : "#333",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 text-xs disabled:opacity-40"
                style={{ border: "1px solid #d0d0d0", borderRadius: 4 }}
              >
                →
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// Also export a simple KPI dashboard component
export function AnalyticsDashboard({ kpis, stages, sources, companyLTV, topProducts }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kpis: any[]; stages: any[]; sources: any[]; companyLTV: any[]; topProducts: any[]
}) {
  return (
    <div>
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardBody>
              <p className="text-xs mb-1" style={{ color: "#888" }}>{kpi.label}</p>
              <p className="text-xl font-bold" style={{ color: kpi.color ?? "#333" }}>{kpi.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Stages */}
        <Card>
          <CardBody>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "#333" }}>Сделки по стадиям</h3>
            {stages.map((s) => (
              <div key={s.key} className="mb-3">
                <div className="flex justify-between text-xs mb-1" style={{ color: "#555" }}>
                  <span>{s.label}</span>
                  <span>{s.count} ({s.pct}%)</span>
                </div>
                <div className="w-full rounded-full h-2" style={{ background: "#f0f0f0" }}>
                  <div className="h-2 rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Sources */}
        <Card>
          <CardBody>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "#333" }}>Лиды по источникам</h3>
            {sources.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Нет данных</p>
            ) : (
              <div className="space-y-2">
                {sources.map(([src, stats]) => (
                  <div key={src} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "#555" }}>{src}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs" style={{ color: "#888" }}>{stats.leads} лидов</span>
                      {stats.revenue > 0 && <span className="text-xs font-medium" style={{ color: "#2e7d32" }}>{formatCurrency(stats.revenue)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LTV */}
        <Card>
          <CardBody>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "#333" }}>LTV по компаниям (топ 10)</h3>
            {companyLTV.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Нет данных</p>
            ) : (
              <div className="space-y-2">
                {companyLTV.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="text-xs w-5 flex-shrink-0 font-bold" style={{ color: "#aaa" }}>{i + 1}</span>
                    <span className="flex-1 text-xs truncate" style={{ color: "#333" }}>{c.name}</span>
                    <span className="text-xs font-semibold" style={{ color: "#2e7d32" }}>{formatCurrency(c.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Top products */}
        <Card>
          <CardBody>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "#333" }}>Топ товаров по выручке</h3>
            {topProducts.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Нет данных</p>
            ) : (
              <div className="space-y-2">
                {topProducts.map((p, i) => (
                  <div key={p.sku} className="flex items-center gap-3">
                    <span className="text-xs w-5 flex-shrink-0 font-bold" style={{ color: "#aaa" }}>{i + 1}</span>
                    <span className="flex-1 text-xs truncate" style={{ color: "#333" }}>{p.name}</span>
                    <span className="text-xs" style={{ color: "#888" }}>{p.qty} шт.</span>
                    <span className="text-xs font-semibold" style={{ color: "#2e7d32" }}>{formatCurrency(p.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
