import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import DownloadPdfButton from "@/components/ui/DownloadPdfButton";

export default async function PublicQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: quote }, { data: items }, { data: supplier }, { data: catDescs }] = await Promise.all([
    admin.from("quotes").select("*, companies(name, inn), contacts(full_name, phone, email), users!quotes_manager_id_fkey(id, full_name, email)").eq("id", id).single(),
    admin.from("quote_items").select("*").eq("quote_id", id).order("sort_order"),
    admin.from("supplier_settings").select("*").limit(1).single(),
    admin.from("category_descriptions").select("*").order("sort_order"),
  ]);

  if (!quote) notFound();

  // Get manager signature
  const managerId = (quote.users as { id: string })?.id;
  const { data: sigData } = managerId
    ? await admin.from("email_signatures").select("body").eq("manager_id", managerId).limit(1).single()
    : { data: null };

  const totalAmount = (items ?? []).reduce((s, i) => s + (i.sum ?? 0), 0);
  const vatAmount = quote.vat_enabled ? Math.round(totalAmount * 0.2 * 100) / 100 : 0;
  const totalWithVat = totalAmount + vatAmount;
  const manager = quote.users as { full_name: string; email?: string } | null;

  // Group items by category (extract from name "Category / Subcategory / Name")
  const categoryMap = new Map<string, typeof items>();
  for (const item of items ?? []) {
    const parts = item.name.split(" / ");
    const cat = parts.length >= 2 ? parts[0] : "Товары";
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push(item);
  }

  // Match category descriptions
  const catDescMap = new Map((catDescs ?? []).map((d) => [d.category.toLowerCase(), d]));

  const logoUrl = supplier?.logo_url;

  return (
    <div style={{ background: "#faf8f5", minHeight: "100vh" }}>
      {/* Page content */}
      {/* PDF download bar */}
      <div id="pdf-buttons" style={{ maxWidth: 900, margin: "0 auto", padding: "12px 0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <DownloadPdfButton filename={`КП_${quote.quote_number}_${quote.companies?.name ?? ""}`} />
      </div>

      <div id="quote-content" style={{ maxWidth: 900, margin: "0 auto", background: "#fff" }}>

        {/* Header with logo */}
        <div style={{ padding: "32px 40px 20px", borderBottom: "2px solid #e8e0d4" }}>
          {logoUrl && <img src={logoUrl} alt="Logo" style={{ height: 48, marginBottom: 16 }} crossOrigin="anonymous" />}
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#3d3325", margin: 0, fontFamily: "Georgia, serif" }}>
            Коммерческое предложение
          </h1>
          <p style={{ fontSize: 14, color: "#8c7e6a", marginTop: 4 }}>
            для {quote.companies?.name ?? quote.contacts?.full_name ?? "клиента"}
          </p>
          <p style={{ fontSize: 12, color: "#b3a894", marginTop: 2 }}>
            №{quote.quote_number} от {new Date(quote.created_at).toLocaleDateString("ru-RU")}
          </p>
        </div>

        {/* Category sections with descriptions + products */}
        <div style={{ padding: "0 40px" }}>
          {[...categoryMap.entries()].map(([category, catItems]) => {
            const desc = catDescMap.get(category.toLowerCase());
            return (
              <div key={category} style={{ padding: "28px 0", borderBottom: "1px solid #efe9df" }}>
                {/* Category header + description */}
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "#3d3325", marginBottom: 8, fontFamily: "Georgia, serif" }}>
                  {desc?.title ?? category}
                </h2>
                {desc?.description && (
                  <div style={{ fontSize: 13, color: "#6b5e4f", lineHeight: 1.7, marginBottom: 20, paddingLeft: 16, borderLeft: "3px solid #d4c9b8" }}>
                    {desc.description.split("\n").map((line: string, i: number) => (
                      <p key={i} style={{ margin: "4px 0" }}>{line.startsWith("- ") ? `• ${line.slice(2)}` : line}</p>
                    ))}
                  </div>
                )}

                {/* Products grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
                  {(catItems ?? []).map((item) => (
                    <div key={item.id} style={{ display: "flex", gap: 14, padding: 16, borderRadius: 8, background: "#faf8f5", border: "1px solid #efe9df" }}>
                      {/* Photo */}
                      {item.image_url ? (
                        <img src={item.image_url} alt="" style={{ width: 80, height: 80, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 80, height: 80, borderRadius: 6, background: "#efe9df", flexShrink: 0 }} />
                      )}
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "#3d3325", marginBottom: 2 }}>{item.name.split(" / ").pop()}</p>
                        {item.article && <p style={{ fontSize: 11, color: "#b3a894" }}>Арт. {item.article}</p>}
                        {item.description && <p style={{ fontSize: 11, color: "#8c7e6a", marginTop: 4 }}>{item.description}</p>}
                        {item.price_tiers?.length ? (
                          <div style={{ marginTop: 8 }}>
                            <p style={{ fontSize: 11, color: "#8c7e6a", marginBottom: 4 }}>Цены при разном объёме:</p>
                            {item.price_tiers.map((tier: { from_qty: number; to_qty: number | null; price: number }, ti: number) => (
                              <div key={ti} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13 }}>
                                <span style={{ color: "#8c7e6a" }}>{tier.from_qty}{tier.to_qty ? `–${tier.to_qty}` : "+"} шт.</span>
                                <span style={{ fontWeight: 700, color: "#6b5e4f" }}>{formatCurrency(tier.price)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                            {item.discount_pct > 0 && (
                              <span style={{ fontSize: 12, color: "#b3a894", textDecoration: "line-through" }}>{formatCurrency(item.base_price)}</span>
                            )}
                            <span style={{ fontSize: 16, fontWeight: 700, color: "#6b5e4f" }}>{formatCurrency(item.client_price)}</span>
                            {item.discount_pct > 0 && (
                              <span style={{ fontSize: 11, color: "#c17f3e", fontWeight: 600 }}>-{item.discount_pct}%</span>
                            )}
                            <span style={{ fontSize: 12, color: "#8c7e6a" }}>× {item.qty} шт.</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#3d3325", marginLeft: "auto" }}>{formatCurrency(item.sum)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Total */}
        {!quote.hide_total && (
          <div style={{ padding: "24px 40px", background: "#f5f0e8", borderTop: "2px solid #e8e0d4" }}>
            {quote.vat_enabled ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "#8c7e6a" }}>Сумма без НДС:</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: "#6b5e4f" }}>{formatCurrency(totalAmount)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "#8c7e6a" }}>НДС (20%):</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: "#6b5e4f" }}>{formatCurrency(vatAmount)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 12, marginTop: 6, paddingTop: 8, borderTop: "1px solid #d4c9b8" }}>
                  <span style={{ fontSize: 14, color: "#8c7e6a" }}>Итого с НДС:</span>
                  <span style={{ fontSize: 28, fontWeight: 700, color: "#3d3325", fontFamily: "Georgia, serif" }}>{formatCurrency(totalWithVat)}</span>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 14, color: "#8c7e6a" }}>Итого:</span>
                <span style={{ fontSize: 28, fontWeight: 700, color: "#3d3325", fontFamily: "Georgia, serif" }}>{formatCurrency(totalAmount)}</span>
              </div>
            )}
          </div>
        )}

        {/* Terms */}
        {(quote.payment_terms || quote.delivery_terms || quote.comment) && (
          <div style={{ padding: "20px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {quote.payment_terms && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#b3a894", textTransform: "uppercase", letterSpacing: 1 }}>Условия оплаты</p>
                <p style={{ fontSize: 13, color: "#3d3325", marginTop: 4 }}>{quote.payment_terms}</p>
              </div>
            )}
            {quote.delivery_terms && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#b3a894", textTransform: "uppercase", letterSpacing: 1 }}>Доставка</p>
                <p style={{ fontSize: 13, color: "#3d3325", marginTop: 4 }}>{quote.delivery_terms}</p>
              </div>
            )}
            {quote.comment && (
              <div style={{ gridColumn: "1 / -1" }}>
                <p style={{ fontSize: 13, color: "#6b5e4f", fontStyle: "italic" }}>{quote.comment}</p>
              </div>
            )}
          </div>
        )}

        {/* Manager contact / signature */}
        <div style={{ padding: "24px 40px", borderTop: "1px solid #efe9df" }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#b3a894", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Ваш менеджер</p>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#3d3325" }}>{manager?.full_name}</p>
          {manager?.email && <p style={{ fontSize: 13, color: "#6b5e4f" }}>{manager.email}</p>}
          {sigData?.body && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #efe9df", fontSize: 12, color: "#8c7e6a", whiteSpace: "pre-wrap" }}>
              {sigData.body}
            </div>
          )}

          {/* CTA */}
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            {manager?.email && (
              <a href={`mailto:${manager.email}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 24px", background: "#6b5e4f", color: "#fff", borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                Email
              </a>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 40px", fontSize: 11, textAlign: "center", color: "#b3a894", borderTop: "1px solid #efe9df" }}>
          Artevo — антивандальные держатели и косметика Havenberg для HoReCa
        </div>
      </div>
    </div>
  );
}
