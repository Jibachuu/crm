import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { formatCurrency } from "@/lib/utils";

export default async function PublicQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: quote } = await admin.from("quotes")
    .select("*, companies(name, inn), contacts(full_name, phone, email), users!quotes_manager_id_fkey(full_name, phone, email)")
    .eq("id", id)
    .single();

  if (!quote) notFound();

  const { data: items } = await admin.from("quote_items")
    .select("*")
    .eq("quote_id", id)
    .order("sort_order");

  const totalAmount = (items ?? []).reduce((s, i) => s + (i.sum ?? 0), 0);
  const avgDiscount = items?.length ? Math.round((items.reduce((s, i) => s + (i.discount_pct ?? 0), 0) / items.length) * 10) / 10 : 0;

  const manager = quote.users as { full_name: string; phone?: string; email?: string } | null;
  const managerPhone = manager?.phone?.replace(/[^0-9+]/g, "") ?? "";

  return (
    <div style={{ background: "#f5f5f5", minHeight: "100vh", padding: "20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ background: "#1e2330", color: "#fff", padding: "24px 32px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Коммерческое предложение</h1>
          <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>от Artevo — №{quote.quote_number} от {new Date(quote.created_at).toLocaleDateString("ru-RU")}</p>
        </div>

        <div style={{ padding: "24px 32px" }}>
          {/* Client info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            <div>
              <p style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4 }}>КЛИЕНТ</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>{quote.companies?.name ?? quote.contacts?.full_name ?? "—"}</p>
              {quote.companies?.inn && <p style={{ fontSize: 12, color: "#888" }}>ИНН {quote.companies.inn}</p>}
              {quote.contacts && <p style={{ fontSize: 12, color: "#666" }}>{quote.contacts.full_name}{quote.contacts.phone ? ` • ${quote.contacts.phone}` : ""}</p>}
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4 }}>МЕНЕДЖЕР</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>{manager?.full_name ?? "—"}</p>
              {manager?.phone && <p style={{ fontSize: 12, color: "#666" }}>{manager.phone}</p>}
              {manager?.email && <p style={{ fontSize: 12, color: "#666" }}>{manager.email}</p>}
            </div>
          </div>

          {/* Items */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e4e4e4" }}>
                {["", "Наименование", "Арт.", "Цена", "Цена для вас", "Скидка", "Кол-во", "Сумма"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 6px", fontSize: 11, fontWeight: 600, color: "#888" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item, i) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 6px", width: 50 }}>
                    {item.image_url ? (
                      <img src={item.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 4, background: "#f5f5f5" }} />
                    )}
                  </td>
                  <td style={{ padding: "8px 6px", fontSize: 13, fontWeight: 500, color: "#333" }}>{item.name}</td>
                  <td style={{ padding: "8px 6px", fontSize: 12, color: "#888" }}>{item.article || "—"}</td>
                  <td style={{ padding: "8px 6px", fontSize: 12, color: "#aaa", textDecoration: item.discount_pct > 0 ? "line-through" : "none" }}>{formatCurrency(item.base_price)}</td>
                  <td style={{ padding: "8px 6px", fontSize: 13, fontWeight: 600, color: "#2e7d32" }}>{formatCurrency(item.client_price)}</td>
                  <td style={{ padding: "8px 6px", fontSize: 12, color: item.discount_pct > 0 ? "#e65c00" : "#ccc" }}>{item.discount_pct > 0 ? `-${item.discount_pct}%` : "—"}</td>
                  <td style={{ padding: "8px 6px", fontSize: 13 }}>{item.qty}</td>
                  <td style={{ padding: "8px 6px", fontSize: 13, fontWeight: 600, color: "#333" }}>{formatCurrency(item.sum)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
            <div style={{ textAlign: "right" }}>
              {avgDiscount > 0 && <p style={{ fontSize: 12, color: "#e65c00" }}>Средняя скидка: {avgDiscount}%</p>}
              <p style={{ fontSize: 20, fontWeight: 700, color: "#2e7d32" }}>Итого: {formatCurrency(totalAmount)}</p>
            </div>
          </div>

          {/* Terms */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: 16, background: "#f8f9fa", borderRadius: 6, marginBottom: 24 }}>
            {quote.payment_terms && (
              <div><p style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>УСЛОВИЯ ОПЛАТЫ</p><p style={{ fontSize: 13, color: "#333" }}>{quote.payment_terms}</p></div>
            )}
            {quote.delivery_terms && (
              <div><p style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>ДОСТАВКА</p><p style={{ fontSize: 13, color: "#333" }}>{quote.delivery_terms}</p></div>
            )}
          </div>

          {quote.comment && (
            <div style={{ padding: 16, background: "#fff9c4", borderRadius: 6, marginBottom: 24 }}>
              <p style={{ fontSize: 12, color: "#333" }}>{quote.comment}</p>
            </div>
          )}

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", padding: "16px 0" }}>
            {managerPhone && (
              <a href={`https://wa.me/${managerPhone.replace("+", "")}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", background: "#25d366", color: "#fff", borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                Написать в WhatsApp
              </a>
            )}
            {manager?.email && (
              <a href={`mailto:${manager.email}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", background: "#0067a5", color: "#fff", borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                Написать на Email
              </a>
            )}
          </div>
        </div>

        <div style={{ background: "#1e2330", color: "rgba(255,255,255,0.5)", padding: "12px 32px", fontSize: 11, textAlign: "center" }}>
          Artevo — антивандальные держатели и косметика Havenberg для HoReCa
        </div>
      </div>
    </div>
  );
}
