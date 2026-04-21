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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function itemSum(i: any): number {
    if (i.variants?.length) return i.variants.reduce((s: number, v: { sum?: number; price: number; quantity: number }) => s + (v.sum ?? v.price * v.quantity), 0);
    return i.sum ?? 0;
  }
  const totalAmount = (items ?? []).reduce((s, i) => s + itemSum(i), 0);
  const manager = quote.users as { full_name: string; email?: string } | null;

  // Multiple columns support
  const colTitles = (quote.column_titles ?? {}) as Record<string, string>;
  const columnIndices = [...new Set((items ?? []).map((i: { column_index?: number }) => i.column_index ?? 0))].sort();
  const hasMultipleColumns = columnIndices.length > 1;

  // Group items by column, then by category
  function groupByCategory(colItems: typeof items) {
    const categoryMap = new Map<string, typeof items>();
    for (const item of colItems ?? []) {
      const parts = item.name.split(" / ");
      const cat = parts.length >= 2 ? parts[0] : "Товары";
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat)!.push(item);
    }
    return categoryMap;
  }

  // Default grouping (all items if single column)
  const categoryMap = groupByCategory(items);

  // Match category descriptions — per-quote overrides take priority
  const catDescMap = new Map((catDescs ?? []).map((d) => [d.category.toLowerCase(), d]));
  const overrides = (quote.category_overrides ?? {}) as Record<string, { title: string; description: string }>;
  type CustomBlock = { id: string; title: string; description: string; photos: string[]; position: string };
  const customBlocks = (quote.custom_blocks ?? []) as CustomBlock[];
  const blocksTop = customBlocks.filter((b) => b.position === "top");
  const blocksBottom = customBlocks.filter((b) => b.position === "bottom");
  const blocksByCategory = new Map<string, CustomBlock[]>();
  for (const b of customBlocks) {
    if (b.position?.startsWith("after:")) {
      const cat = b.position.slice(6);
      if (!blocksByCategory.has(cat)) blocksByCategory.set(cat, []);
      blocksByCategory.get(cat)!.push(b);
    }
  }

  function renderBlock(b: CustomBlock) {
    return (
      <div key={b.id} style={{ padding: "20px 40px", borderBottom: "1px solid #efe9df", pageBreakInside: "avoid" }}>
        {b.title && <h2 style={{ fontSize: 18, fontWeight: 700, color: "#3d3325", marginBottom: 8, fontFamily: "Georgia, serif" }}>{b.title}</h2>}
        {b.description && (
          <div style={{ fontSize: 13, color: "#6b5e4f", lineHeight: 1.7, marginBottom: 14 }}>
            {b.description.split("\n").map((line, i) => <p key={i} style={{ margin: "4px 0" }}>{line}</p>)}
          </div>
        )}
        {b.photos?.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(b.photos.length, 4)}, 1fr)`, gap: 10 }}>
            {b.photos.map((url, pi) => (
              <img key={pi} src={url} alt="" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 6, border: "1px solid #efe9df" }} />
            ))}
          </div>
        )}
      </div>
    );
  }

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

        {/* Custom blocks at top */}
        {blocksTop.map(renderBlock)}

        {/* Render columns — each column has its own categories and total */}
        {columnIndices.map((colIdx) => {
          const colItems = (items ?? []).filter((i: { column_index?: number }) => (i.column_index ?? 0) === colIdx);
          const colCategoryMap = groupByCategory(colItems);
          const colTotal = colItems.reduce((s: number, i) => s + itemSum(i), 0);
          const colTitle = colTitles[String(colIdx)];

          return (
            <div key={colIdx}>
              {/* Column header (only if multiple columns) */}
              {hasMultipleColumns && (
                <div style={{ padding: "16px 40px 8px", borderTop: colIdx > 0 ? "3px solid #e8e0d4" : "none", marginTop: colIdx > 0 ? 8 : 0 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0067a5", fontFamily: "Georgia, serif" }}>
                    {colTitle || `Вариант ${colIdx + 1}`}
                  </h2>
                </div>
              )}

              {/* Category sections */}
              <div style={{ padding: "0 40px" }}>
                {[...colCategoryMap.entries()].map(([category, catItems]) => {
                  const desc = catDescMap.get(category.toLowerCase());
                  const override = overrides[category];
                  const displayTitle = override?.title || desc?.title || category;
                  const displayDesc = override?.description ?? desc?.description ?? "";
                  const catBlocks = blocksByCategory.get(category) ?? [];
                  return (
                    <>
                    <div key={`${colIdx}-${category}`} style={{ padding: "28px 0", borderBottom: "1px solid #efe9df", pageBreakInside: "avoid" }}>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#3d3325", marginBottom: 8, fontFamily: "Georgia, serif" }}>
                        {displayTitle}
                      </h2>
                      {displayDesc && (
                        <div style={{ fontSize: 13, color: "#6b5e4f", lineHeight: 1.7, marginBottom: 20, paddingLeft: 16, borderLeft: "3px solid #d4c9b8" }}>
                          {displayDesc.split("\n").map((line: string, i: number) => (
                            <p key={i} style={{ margin: "4px 0" }}>{line.startsWith("- ") ? `• ${line.slice(2)}` : line}</p>
                          ))}
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
                        {(catItems ?? []).map((item) => {
                          const BOTTLE_LABELS: Record<string, string> = { uv: "С УФ печатью", uv_logo: "С УФ печатью и лого", sticker: "С наклейкой", sticker_logo: "С наклейкой и лого" };
                          const bottleLabel = item.bottle_variant && item.bottle_variant !== "none" ? BOTTLE_LABELS[item.bottle_variant] : null;
                          const hasVariants = item.variants?.length > 0;
                          return (
                            <div key={item.id} style={{ padding: 16, borderRadius: 8, background: "#faf8f5", border: "1px solid #efe9df", pageBreakInside: "avoid", breakInside: "avoid", gridColumn: hasVariants ? "1 / -1" : undefined }}>
                              {hasVariants ? (() => {
                                // ═══ Раскладка с вариантами: основной (с фото) слева, остальные справа таблицей ═══
                                type V = { label: string; price: number; quantity: number; sum: number; image_url?: string; price_tiers?: { from_qty: number; to_qty: number | null; price: number }[]; hide_photo?: boolean };
                                const variantList = item.variants as V[];
                                // Find main variant: first with visible photo
                                const mainIdx = variantList.findIndex((v) => !v.hide_photo && v.image_url);
                                const mainVariant = mainIdx >= 0 ? variantList[mainIdx] : null;
                                const otherVariants = mainIdx >= 0 ? variantList.filter((_, i) => i !== mainIdx) : variantList;

                                function renderTiersOrPrice(v: V, compact = false) {
                                  if (v.price_tiers?.length) {
                                    return (
                                      <div style={{ width: "100%" }}>
                                        {v.price_tiers.map((tier, ti) => (
                                          <div key={ti} style={{ display: "flex", justifyContent: "space-between", fontSize: compact ? 11 : 12, padding: compact ? "1px 0" : "2px 0", gap: 8 }}>
                                            <span style={{ color: "#8c7e6a" }}>{tier.from_qty}{tier.to_qty ? `–${tier.to_qty}` : "+"} шт.</span>
                                            <span style={{ fontWeight: 700, color: "#6b5e4f" }}>{formatCurrency(tier.price)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  }
                                  return (
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, fontSize: compact ? 12 : 14 }}>
                                      <span style={{ fontWeight: 700, color: "#6b5e4f" }}>{formatCurrency(v.price)}</span>
                                      {v.quantity > 1 && <span style={{ fontSize: 10, color: "#8c7e6a" }}>× {v.quantity}</span>}
                                    </div>
                                  );
                                }

                                // Build unified tier header from any variant that has tiers
                                const anyTiers = variantList.find((v) => v.price_tiers?.length)?.price_tiers ?? [];
                                const tierLabels = anyTiers.map((t) => `${t.from_qty}${t.to_qty ? `–${t.to_qty}` : "+"} шт.`);

                                return (
                                  <div>
                                    <div style={{ marginBottom: 14 }}>
                                      <p style={{ fontSize: 16, fontWeight: 700, color: "#3d3325", marginBottom: 2 }}>{item.name.split(" / ").pop()}</p>
                                      {item.article && <p style={{ fontSize: 11, color: "#b3a894" }}>Арт. {item.article}</p>}
                                      {item.description && <p style={{ fontSize: 12, color: "#8c7e6a", marginTop: 4 }}>{item.description}</p>}
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: mainVariant ? "minmax(180px, 260px) 1fr" : "1fr", gap: 16 }} className="kp-variants-grid">
                                      {/* Main variant (with photo) */}
                                      {mainVariant && (
                                        <div style={{ padding: 10, background: "#f8f4fa", border: "1px solid #e1bee7", borderRadius: 6 }}>
                                          <img src={mainVariant.image_url} alt="" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 4, background: "#fff", marginBottom: 8 }} />
                                          <p style={{ fontSize: 13, fontWeight: 700, color: "#3d3325", textAlign: "center", marginBottom: 8 }}>{mainVariant.label}</p>
                                          {renderTiersOrPrice(mainVariant, false)}
                                        </div>
                                      )}

                                      {/* Other variants — table-like rows */}
                                      {otherVariants.length > 0 && (
                                        <div style={{ overflowX: "auto" }}>
                                          {tierLabels.length > 0 ? (
                                            // Render as table with tier columns
                                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                              <thead>
                                                <tr style={{ background: "#efe9df" }}>
                                                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#3d3325", borderBottom: "1px solid #d4c9b8" }}>Вариант</th>
                                                  {tierLabels.map((lbl, ti) => (
                                                    <th key={ti} style={{ padding: "6px 8px", textAlign: "right", fontWeight: 500, color: "#6b5e4f", borderBottom: "1px solid #d4c9b8", whiteSpace: "nowrap" }}>{lbl}</th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {otherVariants.map((v, vi) => (
                                                  <tr key={vi} style={{ borderBottom: "1px solid #efe9df" }}>
                                                    <td style={{ padding: "8px", fontWeight: 500, color: "#3d3325" }}>{v.label}</td>
                                                    {v.price_tiers?.length
                                                      ? anyTiers.map((t, ti) => {
                                                          const matchedTier = v.price_tiers!.find((pt) => pt.from_qty === t.from_qty);
                                                          return (
                                                            <td key={ti} style={{ padding: "8px", textAlign: "right", color: "#6b5e4f", fontWeight: 600, whiteSpace: "nowrap" }}>
                                                              {matchedTier ? formatCurrency(matchedTier.price) : "—"}
                                                            </td>
                                                          );
                                                        })
                                                      : tierLabels.map((_, ti) => (
                                                          // Fallback: single price repeated
                                                          <td key={ti} style={{ padding: "8px", textAlign: "right", color: "#6b5e4f", fontWeight: 600, whiteSpace: "nowrap" }}>
                                                            {ti === 0 ? formatCurrency(v.price) : ""}
                                                          </td>
                                                        ))}
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          ) : (
                                            // Simple table — no tiers, just label and price
                                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                              <tbody>
                                                {otherVariants.map((v, vi) => (
                                                  <tr key={vi} style={{ borderBottom: "1px solid #efe9df" }}>
                                                    <td style={{ padding: "8px 10px", color: "#3d3325", fontWeight: 500 }}>{v.label}</td>
                                                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#6b5e4f", fontWeight: 700, whiteSpace: "nowrap" }}>{formatCurrency(v.price)}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {/* Mobile-friendly CSS */}
                                    <style>{`
                                      @media (max-width: 640px) {
                                        .kp-variants-grid { grid-template-columns: 1fr !important; }
                                      }
                                    `}</style>
                                  </div>
                                );
                              })() : (
                                // ═══ Обычная раскладка с большим фото слева ═══
                                <div style={{ display: "flex", gap: 14 }}>
                                  {item.hide_photo ? null : item.image_url ? (
                                    <img src={item.image_url} alt="" style={{ width: 140, height: 140, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                                  ) : (
                                    <div style={{ width: 140, height: 140, borderRadius: 6, background: "#efe9df", flexShrink: 0 }} />
                                  )}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 14, fontWeight: 600, color: "#3d3325", marginBottom: 2 }}>{item.name.split(" / ").pop()}</p>
                                    {item.article && <p style={{ fontSize: 11, color: "#b3a894" }}>Арт. {item.article}</p>}
                                    {bottleLabel && <p style={{ fontSize: 11, color: "#7b1fa2", fontWeight: 600, marginTop: 2 }}>{bottleLabel}</p>}
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
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {catBlocks.map(renderBlock)}
                    </>
                  );
                })}
              </div>

              {/* Column total */}
              {!quote.hide_total && (
                <div style={{ padding: "16px 40px", background: hasMultipleColumns ? "#f8f5f0" : "#f5f0e8", borderTop: "2px solid #e8e0d4" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 12 }}>
                    <span style={{ fontSize: 14, color: "#8c7e6a" }}>
                      {hasMultipleColumns ? `Итого ${colTitle || `вариант ${colIdx + 1}`}:` : "Итого:"}
                    </span>
                    <span style={{ fontSize: hasMultipleColumns ? 22 : 28, fontWeight: 700, color: "#3d3325", fontFamily: "Georgia, serif" }}>
                      {formatCurrency(hasMultipleColumns ? colTotal : totalAmount)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Custom blocks at bottom */}
        {blocksBottom.map(renderBlock)}

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
