import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Entity = "companies" | "contacts" | "leads" | "deals" | "samples";

function parseDate(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();

  // Excel serial date number (e.g. 46269.66806712963)
  const num = Number(s);
  if (!isNaN(num) && num > 25000 && num < 100000) {
    // Excel epoch: 1899-12-30
    const excelEpoch = new Date(1899, 11, 30);
    const ms = excelEpoch.getTime() + num * 86400000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // DD.MM.YYYY HH:MM:SS
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, d, mo, y, hh = "00", mm = "00", ss = "00"] = m;
    return `${y}-${mo}-${d}T${hh}:${mm}:${ss}`;
  }

  // ISO format or any other parseable date
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();

  return null;
}

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(String(val).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().trim();
}

const DEAL_STAGE_MAP: Record<string, string> = {
  "лид": "lead", "lead": "lead",
  "предложение": "proposal", "proposal": "proposal",
  "переговоры": "negotiation", "negotiation": "negotiation",
  "сборка заказа": "order_assembly", "order_assembly": "order_assembly",
  "выиграна": "won", "won": "won",
  "проиграна": "lost", "lost": "lost",
};

const LEAD_STATUS_MAP: Record<string, string> = {
  "новая": "new", "новый": "new", "new": "new",
  "перезвонить": "callback", "перезвонить/написать": "callback", "написать": "callback", "callback": "callback",
  "в работе": "in_progress", "in_progress": "in_progress",
  "пробники": "samples", "samples": "samples",
  "пробники отгружены": "samples_shipped", "samples_shipped": "samples_shipped",
  "счёт на предоплату": "invoice", "счет на предоплату": "invoice", "invoice": "invoice",
  "отказ": "rejected", "rejected": "rejected",
  "конвертирован": "converted", "converted": "converted",
  // legacy
  "квалифицирован": "in_progress", "qualified": "in_progress",
  "не подходит": "rejected", "unqualified": "rejected",
};

function normStage(val: unknown, isLead: boolean): string {
  const s = norm(val);
  if (isLead) return LEAD_STATUS_MAP[s] ?? "new";
  return DEAL_STAGE_MAP[s] ?? "lead";
}


const BATCH = 500;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { entity: Entity; rows: Record<string, unknown>[]; mode?: "skip" | "update" };
  const { entity, rows, mode = "update" } = body;

  if (!["companies", "contacts", "leads", "deals", "samples"].includes(entity)) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── Paginated fetch (bypasses PostgREST 1000-row limit) ─────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function fetchAllRows(table: string, select: string): Promise<any[]> {
    const PAGE = 1000;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = [];
    let offset = 0;
    while (true) {
      const { data } = await admin.from(table).select(select).range(offset, offset + PAGE - 1);
      if (!data?.length) break;
      all.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    return all;
  }

  // ── Load lookup maps once ──────────────────────────────────────────────────
  const [existingCompanies, existingContacts, allUsers] = await Promise.all([
    fetchAllRows("companies", "id, name"),
    fetchAllRows("contacts", "id, full_name, phone, email, telegram_id, telegram_username, maks_id"),
    fetchAllRows("users", "id, full_name"),
  ]);

  const companyMap = new Map<string, string>(); // norm(name) → id
  for (const c of existingCompanies ?? []) companyMap.set(norm(c.name), c.id);

  // Contact lookup: messenger IDs → phone → email → name+phone
  const contactByTgId = new Map<string, string>();
  const contactByMaksId = new Map<string, string>();
  const contactByPhone = new Map<string, string>();
  const contactByEmail = new Map<string, string>();
  const contactMap = new Map<string, string>(); // norm(name)|norm(phone) → id
  for (const c of existingContacts ?? []) {
    if (c.telegram_id) contactByTgId.set(c.telegram_id, c.id);
    if (c.maks_id) contactByMaksId.set(c.maks_id, c.id);
    if (c.phone) {
      const clean = c.phone.replace(/\D/g, "").slice(-10);
      if (clean.length >= 7) contactByPhone.set(clean, c.id);
    }
    if (c.email) contactByEmail.set(norm(c.email), c.id);
    if (c.phone) contactMap.set(norm(c.full_name) + "|" + norm(c.phone), c.id);
    if (c.email) contactMap.set(norm(c.full_name) + "|" + norm(c.email), c.id);
  }

  // Match name against a user list (sync, no side effects)
  function matchUser(name: string, userList: { id: string; full_name: string }[]): string | null {
    const low = norm(name);
    if (!low) return null;
    for (const u of userList) if (norm(u.full_name) === low) return u.id;
    for (const u of userList) { const d = norm(u.full_name); if (d.includes(low) || low.includes(d)) return u.id; }
    const words = low.split(/\s+/).filter(Boolean);
    for (const u of userList) { const d = norm(u.full_name); if (words.length > 0 && words.every((w) => d.includes(w))) return u.id; }
    const sig = words.filter((w) => w.length >= 4);
    for (const u of userList) { const d = norm(u.full_name); if (sig.length > 0 && sig.some((w) => d.includes(w))) return u.id; }
    return null;
  }

  const errors: string[] = [];
  let added = 0;
  let updated = 0;
  let skipped = 0;

  // Pre-create placeholder users for all unique unmatched responsible names
  const uniqueResponsibleNames = [...new Set(
    rows.map((r) => String(r.assigned_to_name ?? "").trim()).filter(Boolean)
  )];
  const placeholderMap = new Map<string, string>(); // norm(name) → user_id

  for (const name of uniqueResponsibleNames) {
    if (matchUser(name, allUsers ?? [])) continue; // already exists
    const key = norm(name);
    if (placeholderMap.has(key)) continue;

    // Create a placeholder auth user
    const suffix = Math.random().toString(36).slice(2, 10);
    const placeholderEmail = `placeholder.${suffix}@crm.internal`;
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: placeholderEmail,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (authData?.user) {
      // Mark as placeholder (trigger already created public.users row)
      await admin.from("users").update({ is_placeholder: true, is_active: false }).eq("id", authData.user.id);
      placeholderMap.set(key, authData.user.id);
      // Add to allUsers so subsequent rows reuse the same ID
      (allUsers ?? []).push({ id: authData.user.id, full_name: name });
    } else {
      errors.push(`Не удалось создать пользователя "${name}": ${authErr?.message ?? "неизвестная ошибка"}`);
    }
  }

  function findUserId(name: unknown): string {
    if (!name) return user!.id;
    const nameStr = String(name).trim();
    if (!nameStr) return user!.id;
    return matchUser(nameStr, allUsers ?? []) ?? placeholderMap.get(norm(nameStr)) ?? user!.id;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  if (entity === "companies") {
    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; rec: Record<string, unknown> }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row.name ?? "").trim();
      if (!name) { errors.push(`Строка ${i + 2}: нет названия`); continue; }

      const rec: Record<string, unknown> = {
        inn: row.inn || null, ogrn: row.ogrn || null, kpp: row.kpp || null,
        legal_address: row.legal_address || null, city: row.city || null,
        region: row.region || null, director: row.director || null,
        phone: row.phone || null, email: row.email || null, website: row.website || null,
        activity: row.activity || null, need: row.need || null,
        description: row.description || null,
        assigned_to: findUserId(row.assigned_to_name),
      };
      // remove nulls so we don't overwrite filled fields with null on update
      const recClean = Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== null && v !== ""));

      const existingId = companyMap.get(norm(name));
      if (existingId && existingId !== "__pending__") {
        if (mode === "update") toUpdate.push({ id: existingId, rec: recClean });
        else skipped++;
        continue;
      }
      if (existingId === "__pending__") { skipped++; continue; }

      companyMap.set(norm(name), "__pending__");
      if (row.created_at) { const d = parseDate(row.created_at); if (d) recClean.created_at = d; }
      toInsert.push({ name, created_by: user.id, ...recClean });
    }

    // Batch insert new
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { data, error: err } = await admin.from("companies").insert(batch).select("id, name");
      if (err) { errors.push(err.message); continue; }
      for (const c of data ?? []) companyMap.set(norm(c.name), c.id);
      added += batch.length;
    }

    // Update existing one-by-one (can't batch update with different IDs easily)
    for (const { id, rec } of toUpdate) {
      const { error: err } = await admin.from("companies").update(rec).eq("id", id);
      if (err) errors.push(`Обновление ${id}: ${err.message}`);
      else updated++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  else if (entity === "contacts") {
    // Step 1: collect unique company names and batch-create missing ones
    const uniqueCompanyNames = [...new Set(
      rows.map((r) => String(r.company_name ?? "").trim()).filter(Boolean)
    )];
    const missingCompanies = uniqueCompanyNames.filter((n) => !companyMap.has(norm(n)));
    if (missingCompanies.length > 0) {
      const { data } = await admin.from("companies")
        .insert(missingCompanies.map((n) => ({ name: n, created_by: user.id })))
        .select("id, name");
      for (const c of data ?? []) companyMap.set(norm(c.name), c.id);
    }

    // Step 2: prepare contact rows
    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; rec: Record<string, unknown> }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let full_name = String(row.full_name ?? "").trim();
      if (!full_name) {
        const parts = [row.last_name, row.first_name, row.middle_name].filter(Boolean).map(String);
        full_name = parts.join(" ").trim();
      }
      if (!full_name) { errors.push(`Строка ${i + 2}: нет имени`); continue; }

      const phone = String(row.phone ?? "").trim() || null;
      const email = String(row.email ?? "").trim() || null;
      const dupKey = norm(full_name) + "|" + norm(phone ?? "");
      const companyId = companyMap.get(norm(String(row.company_name ?? "").trim())) ?? null;

      const rec: Record<string, unknown> = {
        last_name: row.last_name || null, middle_name: row.middle_name || null,
        position: row.position || null,
        phone_mobile: row.phone_mobile || null, phone_other: row.phone_other || null,
        email_other: row.email_other || null,
        telegram_username: row.telegram_username || null, telegram_id: row.telegram_id || null,
        description: row.description || null,
        company_id: companyId,
        assigned_to: findUserId(row.assigned_to_name),
      };
      const recClean = Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== null && v !== ""));

      const existingId = contactMap.get(dupKey);
      if (existingId && existingId !== "__pending__") {
        if (mode === "update") toUpdate.push({ id: existingId, rec: recClean });
        else skipped++;
        continue;
      }
      if (existingId === "__pending__") { skipped++; continue; }

      contactMap.set(dupKey, "__pending__");
      const fullRec: Record<string, unknown> = { full_name, phone, email, created_by: user.id, ...recClean };
      if (row.created_at) { const d = parseDate(row.created_at); if (d) fullRec.created_at = d; }
      toInsert.push(fullRec);
    }

    // Step 3a: update existing
    for (const { id, rec } of toUpdate) {
      const { error: err } = await admin.from("contacts").update(rec).eq("id", id);
      if (err) errors.push(`Обновление контакта: ${err.message}`);
      else updated++;
    }

    // Step 3b: batch insert (with fallback if new columns don't exist yet)
    const SAFE_CONTACT_FIELDS = ["full_name", "position", "phone", "email", "telegram_id",
      "maks_id", "description", "company_id", "assigned_to", "created_by", "created_at"];
    let useSafeMode = false;

    for (let i = 0; i < toInsert.length; i += BATCH) {
      let batch = toInsert.slice(i, i + BATCH);
      if (useSafeMode) batch = batch.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => SAFE_CONTACT_FIELDS.includes(k))));
      const { error: err } = await admin.from("contacts").insert(batch);
      if (err) {
        if (!useSafeMode && err.message.includes("schema cache")) {
          // New columns don't exist yet — retry batch without them
          useSafeMode = true;
          errors.push("Новые поля (email_other и др.) ещё не добавлены в БД — запустите migration_v3.sql. Импорт продолжен без них.");
          const safeBatch = batch.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => SAFE_CONTACT_FIELDS.includes(k))));
          const { error: err2 } = await admin.from("contacts").insert(safeBatch);
          if (err2) errors.push(`Пакет ${Math.floor(i / BATCH) + 1}: ${err2.message}`);
          else added += batch.length;
        } else {
          errors.push(`Пакет ${Math.floor(i / BATCH) + 1}: ${err.message}`);
        }
      } else {
        added += batch.length;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  else if (entity === "leads" || entity === "deals") {
    const table = entity;

    // Batch-create missing companies
    const uniqueCompanyNames = [...new Set(
      rows.map((r) => String(r.company_name ?? "").trim()).filter(Boolean)
    )];
    const missingCompanies = uniqueCompanyNames.filter((n) => !companyMap.has(norm(n)));
    if (missingCompanies.length > 0) {
      const { data } = await admin.from("companies")
        .insert(missingCompanies.map((n) => ({ name: n, created_by: user.id })))
        .select("id, name");
      for (const c of data ?? []) companyMap.set(norm(c.name), c.id);
    }

    // Batch-create missing contacts — match by phone/email FIRST, not by name
    const contactsToCreate: Record<string, unknown>[] = [];
    const pendingContactKeys = new Set<string>();
    for (const row of rows) {
      const name = String(row.contact_name ?? "").trim();
      if (!name) continue;
      const phone = String(row.contact_phone ?? "").trim() || null;
      const email = String(row.contact_email ?? "").trim() || null;

      // Already exists by phone?
      if (phone) {
        const cleanP = phone.replace(/\D/g, "").slice(-10);
        if (cleanP.length >= 7 && contactByPhone.has(cleanP)) continue;
      }
      // Already exists by email?
      if (email && contactByEmail.has(norm(email))) continue;

      const key = norm(name) + "|" + norm(phone ?? "");
      if (contactMap.has(key) || pendingContactKeys.has(key)) continue;
      pendingContactKeys.add(key);
      const companyId = companyMap.get(norm(String(row.company_name ?? "").trim())) ?? null;
      contactsToCreate.push({
        full_name: name, phone, email,
        telegram_username: row.telegram_username || null,
        company_id: companyId, created_by: user.id,
      });
    }
    if (contactsToCreate.length > 0) {
      const { data } = await admin.from("contacts").insert(contactsToCreate).select("id, full_name, phone, email");
      for (const c of data ?? []) {
        contactMap.set(norm(c.full_name) + "|" + norm(c.phone ?? ""), c.id);
        if (c.phone) {
          const cleanP = c.phone.replace(/\D/g, "").slice(-10);
          if (cleanP.length >= 7) contactByPhone.set(cleanP, c.id);
        }
        if (c.email) contactByEmail.set(norm(c.email), c.id);
      }
    }

    // Build main records
    const toInsert: Record<string, unknown>[] = [];
    const productRows: { idx: number; name: string; sku: string | null; price: number | null; qty: number | null; category: string | null; subcategory: string | null; volume: string | null; aroma: string | null }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const title = String(row.title ?? "").trim();
      if (!title) { errors.push(`Строка ${i + 2}: нет названия`); continue; }

      const companyId = companyMap.get(norm(String(row.company_name ?? "").trim())) ?? null;
      const contactPhone = String(row.contact_phone ?? "").trim() || null;
      const contactName = String(row.contact_name ?? "").trim() || null;
      // Find contact: phone first (unique), then email, then name+phone combo
      let contactId: string | null = null;
      if (contactPhone) {
        const cleanP = contactPhone.replace(/\D/g, "").slice(-10);
        if (cleanP.length >= 7) contactId = contactByPhone.get(cleanP) ?? null;
      }
      const contactEmail = String(row.contact_email ?? "").trim() || null;
      if (!contactId && contactEmail) contactId = contactByEmail.get(norm(contactEmail)) ?? null;
      if (!contactId && contactName) contactId = contactMap.get(norm(contactName) + "|" + norm(contactPhone ?? "")) ?? null;

      const rec: Record<string, unknown> = {
        title,
        [table === "leads" ? "status" : "stage"]: normStage(row.status ?? row.stage, table === "leads"),
        source: row.source || null,
        company_id: companyId, contact_id: contactId,
        description: row.description || null,
        assigned_to: findUserId(row.assigned_to_name),
        created_by: user.id,
      };
      if (table === "deals") {
        rec.amount = parseNum(row.amount);
        if (row.bitrix_id) rec.bitrix_id = String(row.bitrix_id).trim();
      }
      if (table === "leads") {
        rec.telegram_username = row.telegram_username || null;
        rec.had_call = row.had_call || null;
        if (row.bitrix_id) rec.bitrix_id = String(row.bitrix_id).trim();
      }
      if (row.created_at) { const d = parseDate(row.created_at); if (d) rec.created_at = d; }

      // Deal products — structured columns: product_N_category, subcategory, name, sku, volume, aroma, qty, price, total
      if (table === "deals") {
        for (let p = 1; p <= 10; p++) {
          const pName = String(row[`product_${p}_name`] ?? "").trim();
          const pSku = String(row[`product_${p}_sku`] ?? "").trim();
          if (!pName && !pSku) continue;
          const pCategory = String(row[`product_${p}_category`] ?? "").trim();
          const pSubcategory = String(row[`product_${p}_subcategory`] ?? "").trim();
          const pVolume = String(row[`product_${p}_volume`] ?? "").trim();
          const pAroma = String(row[`product_${p}_aroma`] ?? "").trim();
          const pQty = parseNum(row[`product_${p}_qty`]) ?? 1;
          const pPrice = parseNum(row[`product_${p}_price`]) ?? 0;
          productRows.push({
            idx: toInsert.length,
            name: pName || pSku,
            sku: pSku || null,
            price: pPrice,
            qty: pQty,
            category: pCategory || null,
            subcategory: pSubcategory || null,
            volume: pVolume || null,
            aroma: pAroma || null,
          });
        }
      }

      toInsert.push(rec);
    }

    // Batch insert main records
    const insertedIds: (string | null)[] = new Array(toInsert.length).fill(null);
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { data, error: err } = await admin.from(table).insert(batch).select("id");
      if (err) { errors.push(`Пакет ${Math.floor(i / BATCH) + 1}: ${err.message}`); continue; }
      (data ?? []).forEach((d, j) => { insertedIds[i + j] = d.id; });
      added += batch.length;
    }

    // Handle deal products
    // Product linking
    if (table === "deals" && productRows.length > 0) {
      // Load ALL products from catalog
      const allProducts = await fetchAllRows("products", "id, name, sku");
      const productByName = new Map<string, string>(); // norm(name) → id
      const productBySku = new Map<string, string>();   // norm(sku) → id
      for (const p of allProducts) {
        productByName.set(norm(p.name), p.id);
        if (p.sku) productBySku.set(norm(p.sku), p.id);
      }

      // Resolve product IDs: first by SKU (more precise), then by name
      function findProductId(name: string, sku: string | null): string | null {
        if (sku) {
          const bySku = productBySku.get(norm(sku));
          if (bySku) return bySku;
        }
        return productByName.get(norm(name)) ?? null;
      }

      // Collect products that need to be created
      interface ProductToCreate {
        name: string; sku: string; price: number;
        category: string | null; subcategory: string | null; volume: string | null; aroma: string | null;
      }
      const toCreateProducts = new Map<string, ProductToCreate>();
      for (const pr of productRows) {
        if (findProductId(pr.name, pr.sku)) continue;
        const key = pr.sku ? norm(pr.sku) : norm(pr.name);
        if (toCreateProducts.has(key)) continue;
        toCreateProducts.set(key, {
          name: pr.name,
          sku: pr.sku || (pr.name.slice(0, 20) + "_" + Math.random().toString(36).slice(2, 8)),
          price: pr.price ?? 0,
          category: pr.category, subcategory: pr.subcategory,
          volume: pr.volume, aroma: pr.aroma,
        });
      }

      // Create missing products with characteristics
      for (const [, prod] of toCreateProducts) {
        // Build description from characteristics
        const chars = [
          prod.category && `Категория: ${prod.category}`,
          prod.subcategory && `Подкатегория: ${prod.subcategory}`,
          prod.volume && `Объём: ${prod.volume}`,
          prod.aroma && `Аромат: ${prod.aroma}`,
        ].filter(Boolean).join("\n");

        const { data, error: pErr } = await admin.from("products")
          .insert({ name: prod.name, sku: prod.sku, base_price: prod.price, description: chars || null, category: prod.category || null, subcategory: prod.subcategory || null })
          .select("id, name, sku")
          .single();
        if (data) {
          productByName.set(norm(data.name), data.id);
          if (data.sku) productBySku.set(norm(data.sku), data.id);
          // Create product attributes for structured data
          const attrs: { product_id: string; name: string; values: string[] }[] = [];
          if (prod.category) attrs.push({ product_id: data.id, name: "Категория", values: [prod.category] });
          if (prod.subcategory) attrs.push({ product_id: data.id, name: "Подкатегория", values: [prod.subcategory] });
          if (prod.volume) attrs.push({ product_id: data.id, name: "Объём", values: [prod.volume] });
          if (prod.aroma) attrs.push({ product_id: data.id, name: "Аромат", values: [prod.aroma] });
          if (attrs.length > 0) {
            await admin.from("product_attributes").insert(attrs);
          }
        } else if (pErr) {
          // SKU conflict — try with random suffix
          const skuRetry = prod.sku + "_" + Math.random().toString(36).slice(2, 6);
          const { data: d2, error: pErr2 } = await admin.from("products")
            .insert({ name: prod.name, sku: skuRetry, base_price: prod.price, description: chars || null, category: prod.category || null, subcategory: prod.subcategory || null })
            .select("id, name, sku")
            .single();
          if (d2) {
            productByName.set(norm(d2.name), d2.id);
            if (d2.sku) productBySku.set(norm(d2.sku), d2.id);
          } else if (pErr2) {
            errors.push(`Товар "${prod.name}": ${pErr2.message}`);
          }
        }
      }

      const dealProductsToInsert = productRows
        .filter((pr) => insertedIds[pr.idx])
        .map((pr) => ({
          deal_id: insertedIds[pr.idx],
          product_id: findProductId(pr.name, pr.sku),
          quantity: pr.qty ?? 1,
          unit_price: pr.price ?? 0,
          discount_percent: 0,
          total_price: (pr.qty ?? 1) * (pr.price ?? 0),
          product_block: "order",
          category: pr.category ?? null,
          subcategory: pr.subcategory ?? null,
          volume_ml: pr.volume ? parseInt(String(pr.volume).replace(/\D/g, "")) || null : null,
          flavor: pr.aroma ?? null,
        }))
        .filter((dp) => dp.product_id);

      // Insert deal_products

      if (dealProductsToInsert.length > 0) {
        // Insert in batches of 100
        for (let b = 0; b < dealProductsToInsert.length; b += 100) {
          const dpBatch = dealProductsToInsert.slice(b, b + 100);
          const { error: dpErr } = await admin.from("deal_products").insert(dpBatch);
          if (dpErr) {
            errors.push(`[debug] deal_products insert error: ${JSON.stringify(dpErr)}`);
            // Retry without product_block if column doesn't exist yet
            if (dpErr.message?.includes("product_block") || dpErr.message?.includes("schema")) {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const fallback = dpBatch.map(({ product_block: _, ...rest }) => rest);
              const { error: dpErr2 } = await admin.from("deal_products").insert(fallback);
              if (dpErr2) errors.push(`Товары сделок: ${dpErr2.message}`);
              else errors.push("⚠️ Колонка product_block отсутствует — товары добавлены без блока.");
            }
            break;
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  else if (entity === "samples") {
    const toInsert: Record<string, unknown>[] = [];

    for (const row of rows) {
      const companyName = String(row.company_name ?? "").trim();
      const contactName = String(row.contact_name ?? "").trim();

      const statusMap: Record<string, string> = { "новый": "new", "отправлен": "sent", "в пути": "in_transit", "доставлен": "delivered", "отказ": "refused" };
      const dtMap: Record<string, string> = { "пвз": "pvz", "до адреса": "door" };

      const rec: Record<string, unknown> = {
        venue_name: row.venue_name || null,
        contact_phone: row.contact_phone || null,
        materials: row.materials || null,
        delivery_type: dtMap[norm(row.delivery_type)] || "pvz",
        delivery_address: row.delivery_address || null,
        track_number: row.track_number || null,
        sent_date: row.sent_date ? parseDate(row.sent_date) : null,
        arrival_date: row.arrival_date ? parseDate(row.arrival_date) : null,
        status: statusMap[norm(row.status)] || "new",
        comment: row.comment || null,
        created_by: user.id,
        company_id: companyName ? (companyMap.get(norm(companyName)) ?? null) : null,
        contact_id: contactName ? (contactMap.get(norm(contactName)) ?? null) : null,
      };

      toInsert.push(rec);
    }

    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { error: err } = await admin.from("samples").insert(batch);
      if (err) errors.push(`Пакет ${Math.floor(i / BATCH) + 1}: ${err.message}`);
      else added += batch.length;
    }
  }

  return NextResponse.json({ added, updated, skipped, errors, total: rows.length });
}
