-- Migration v72: backfill + brand-rename data repair.
-- Run in Supabase SQL Editor.
-- Idempotent — re-running is safe.

-- ─────────────────────────────────────────────────────────────────
-- 1. Attribute orphaned phone calls to a user (backlog v5 §1.5.1)
-- ─────────────────────────────────────────────────────────────────
-- The novofon webhook used to insert call rows without created_by, so
-- the /calls "Сотрудник" filter returned "Нет звонков" for every
-- employee. The webhook now fills created_by; this fixes existing rows.

-- Inbound: attribute to the assignee of the lead auto-created in the
-- same 5-minute window for the same contact.
UPDATE public.communications c
SET created_by = l.assigned_to
FROM public.leads l
WHERE c.channel = 'phone'
  AND c.direction = 'inbound'
  AND c.created_by IS NULL
  AND c.contact_id IS NOT NULL
  AND c.contact_id = l.contact_id
  AND l.source = 'phone'
  AND l.assigned_to IS NOT NULL
  AND ABS(EXTRACT(EPOCH FROM (c.created_at - l.created_at))) < 300;

-- Outbound: match users.sip_number / sip_login against the operator
-- CallerID stored in from_address. Last-10-digits comparison covers
-- both internal extensions and full DIDs.
UPDATE public.communications c
SET created_by = u.id
FROM public.users u
WHERE c.channel = 'phone'
  AND c.direction = 'outbound'
  AND c.created_by IS NULL
  AND c.from_address IS NOT NULL
  AND (
    u.sip_number = c.from_address
    OR u.sip_login = c.from_address
    OR (
      length(regexp_replace(coalesce(u.sip_number, ''), '\D', '', 'g')) >= 4
      AND right(regexp_replace(coalesce(u.sip_number, ''), '\D', '', 'g'), 10)
        = right(regexp_replace(c.from_address, '\D', '', 'g'), 10)
    )
    OR (
      length(regexp_replace(coalesce(u.sip_login, ''), '\D', '', 'g')) >= 4
      AND right(regexp_replace(coalesce(u.sip_login, ''), '\D', '', 'g'), 10)
        = right(regexp_replace(c.from_address, '\D', '', 'g'), 10)
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 2. Rebrand "с нашим лого" → "с логотипом Havenberg" (§4.4.2)
-- ─────────────────────────────────────────────────────────────────
-- Top-level text columns first.
UPDATE public.products
SET name = regexp_replace(name, 'и\s+наш(им|ем)\s+лого', 'и логотипом Havenberg', 'gi')
WHERE name ~* 'наш(им|ем)\s+лого';

UPDATE public.invoice_items
SET name = regexp_replace(name, 'и\s+наш(им|ем)\s+лого', 'и логотипом Havenberg', 'gi')
WHERE name ~* 'наш(им|ем)\s+лого';

UPDATE public.specification_items
SET name = regexp_replace(name, 'и\s+наш(им|ем)\s+лого', 'и логотипом Havenberg', 'gi')
WHERE name ~* 'наш(им|ем)\s+лого';

UPDATE public.quote_items
SET name = regexp_replace(name, 'и\s+наш(им|ем)\s+лого', 'и логотипом Havenberg', 'gi')
WHERE name ~* 'наш(им|ем)\s+лого';

-- product_variants stores its label inside the attributes JSONB, e.g.
-- {"label": "С УФ печатью и нашим лого"}. Rewrite the JSONB by casting
-- to text → regex replace → cast back. Same trick for lead_products and
-- deal_products which carry a variants JSONB array.
UPDATE public.product_variants
SET attributes = regexp_replace(
  attributes::text,
  'и\s+наш(им|ем)\s+лого',
  'и логотипом Havenberg',
  'gi'
)::jsonb
WHERE attributes::text ~* 'наш(им|ем)\s+лого';

UPDATE public.lead_products
SET variants = regexp_replace(
  variants::text,
  'и\s+наш(им|ем)\s+лого',
  'и логотипом Havenberg',
  'gi'
)::jsonb
WHERE variants::text ~* 'наш(им|ем)\s+лого';

UPDATE public.deal_products
SET variants = regexp_replace(
  variants::text,
  'и\s+наш(им|ем)\s+лого',
  'и логотипом Havenberg',
  'gi'
)::jsonb
WHERE variants::text ~* 'наш(им|ем)\s+лого';

-- quote_items also carries a variants JSONB with labels (added in v61).
UPDATE public.quote_items
SET variants = regexp_replace(
  variants::text,
  'и\s+наш(им|ем)\s+лого',
  'и логотипом Havenberg',
  'gi'
)::jsonb
WHERE variants::text ~* 'наш(им|ем)\s+лого';

-- ─────────────────────────────────────────────────────────────────
-- 3. Repair compound city names mangled by pdftotext (§2.1.5)
-- ─────────────────────────────────────────────────────────────────
UPDATE public.companies
SET address = regexp_replace(
  regexp_replace(address, '(Ростов\s*-\s*на)\s*-?\s*([А-ЯЁ])', '\1-\2', 'g'),
  '(Комсомольск\s*-\s*на)\s*-?\s*([А-ЯЁ])', '\1-\2', 'g'
)
WHERE address ~ '(Ростов-на[А-ЯЁ]|Комсомольск-на[А-ЯЁ])';
