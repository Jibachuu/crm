-- Migration v72: backfill communications.created_by for phone calls
--
-- The novofon webhook used to insert call rows without created_by, so the
-- /calls "Сотрудник" filter returned "Нет звонков" for every employee
-- (backlog v5 §1.5.1). Going forward the webhook now fills created_by from
-- the auto-lead's assignee (inbound) or the operator's SIP (outbound).
-- This migration repairs old rows.
--
-- Run in Supabase SQL Editor.

-- Inbound calls: attribute to the assignee of the lead created at roughly
-- the same time for the same contact. We use a 5-minute window so the
-- lookup is bounded and unambiguous.
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

-- Outbound calls: attribute to the user whose sip_number/sip_login matches
-- the operator's CallerID stored in from_address. Strip non-digits and
-- match the last-7+ digits, which is enough for both internal extensions
-- and full DIDs.
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

-- Backlog v5 §4.4.2: rebrand "с нашим лого" → "с логотипом Havenberg" in all
-- product/variant labels, КП and invoice rows, deal product names. Catches
-- common case variants: "лого", "Лого", "логотип" (already partially matches).
UPDATE public.products
SET name = regexp_replace(name, 'и\s+наш(им|ем)\s+лого', 'и логотипом Havenberg', 'gi')
WHERE name ~* 'наш(им|ем)\s+лого';

UPDATE public.product_variants
SET label = regexp_replace(label, 'и\s+наш(им|ем)\s+лого', 'и логотипом Havenberg', 'gi')
WHERE label ~* 'наш(им|ем)\s+лого';

UPDATE public.deal_products
SET name = regexp_replace(name, 'и\s+наш(им|ем)\s+лого', 'и логотипом Havenberg', 'gi')
WHERE name ~* 'наш(им|ем)\s+лого';

UPDATE public.lead_products
SET name = regexp_replace(name, 'и\s+наш(им|ем)\s+лого', 'и логотипом Havenberg', 'gi')
WHERE name ~* 'наш(им|ем)\s+лого';

UPDATE public.invoice_items
SET name = regexp_replace(name, 'и\s+наш(им|ем)\s+лого', 'и логотипом Havenberg', 'gi')
WHERE name ~* 'наш(им|ем)\s+лого';

UPDATE public.specification_items
SET name = regexp_replace(name, 'и\s+наш(им|ем)\s+лого', 'и логотипом Havenberg', 'gi')
WHERE name ~* 'наш(им|ем)\s+лого';

-- Repair compound Russian city names mangled by the PDF text extractor:
--   "Ростов-наДону" → "Ростов-на-Дону"
--   "Комсомольск-наАмуре" → "Комсомольск-на-Амуре"
-- Backlog v5 §2.1.5.
UPDATE public.companies
SET address = regexp_replace(
  regexp_replace(address, '(Ростов\s*-\s*на)\s*-?\s*([А-ЯЁ])', '\1-\2', 'g'),
  '(Комсомольск\s*-\s*на)\s*-?\s*([А-ЯЁ])', '\1-\2', 'g'
)
WHERE address ~ '(Ростов-на[А-ЯЁ]|Комсомольск-на[А-ЯЁ])';
