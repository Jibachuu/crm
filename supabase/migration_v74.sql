-- Migration v74: phone-digits index + cleanup of duplicate auto-leads
-- Run in Supabase SQL Editor. Idempotent.
--
-- Problem: contacts.phone is stored in various human formats
-- ("+79053713740", "8 (905) 371-37-40", "+7 905 371-37-40"), so the
-- novofon webhook's `phone ilike '%9053713740'` lookup misses any
-- formatted entry. Each unmatched inbound call then creates a NEW
-- contact + a NEW lead, producing the "Звонок: 7905... × N" pile-up
-- the operator reported on 2026-05-04.

-- ─────────────────────────────────────────────────────────────────
-- 1. Generated digits-only column on contacts (all phone fields)
-- ─────────────────────────────────────────────────────────────────
-- Concat puts every phone string side-by-side then strips non-digits.
-- Searching `phone_digits ilike '%9053713740%'` will hit a contact
-- regardless of the original formatting on any of its phone fields.
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone_digits TEXT
  GENERATED ALWAYS AS (
    regexp_replace(
      COALESCE(phone, '') || ' ' ||
      COALESCE(phone_mobile, '') || ' ' ||
      COALESCE(additional_phone_1, '') || ' ' ||
      COALESCE(additional_phone_2, '') || ' ' ||
      COALESCE(additional_phone_3, ''),
      '\D', '', 'g'
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_contacts_phone_digits ON public.contacts (phone_digits);

-- Same trick on companies — webhook also uses company-side lookup
-- when the phone matches a company's listed number.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phone_digits TEXT
  GENERATED ALWAYS AS (
    regexp_replace(
      COALESCE(phone, '') || ' ' ||
      COALESCE(additional_phone_1, '') || ' ' ||
      COALESCE(additional_phone_2, '') || ' ' ||
      COALESCE(additional_phone_3, ''),
      '\D', '', 'g'
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_companies_phone_digits ON public.companies (phone_digits);

-- ─────────────────────────────────────────────────────────────────
-- 2. Soft-delete duplicate auto-created leads (Звонок: PHONE × N)
-- ─────────────────────────────────────────────────────────────────
-- For every (phone) where multiple "Звонок: PHONE" leads exist with
-- source = 'phone' and status in (new, callback) — keep the oldest
-- and soft-delete the rest. Preserves history (deleted_at is set,
-- NOT a hard delete) so /trash can still recover them.
WITH dups AS (
  SELECT id,
         regexp_replace(title, '^Звонок:\s*', '') AS phone,
         created_at,
         row_number() OVER (
           PARTITION BY regexp_replace(title, '^Звонок:\s*', '')
           ORDER BY created_at ASC
         ) AS rn
  FROM public.leads
  WHERE source = 'phone'
    AND title LIKE 'Звонок:%'
    AND status IN ('new', 'callback')
    AND deleted_at IS NULL
)
UPDATE public.leads
SET deleted_at = now()
WHERE id IN (SELECT id FROM dups WHERE rn > 1);

-- ─────────────────────────────────────────────────────────────────
-- 3. Backfill contact_id on existing phone communications
-- ─────────────────────────────────────────────────────────────────
-- Many old call rows have contact_id = NULL because the webhook
-- couldn't match the formatted phone. Now that phone_digits exists,
-- attribute each call to the contact whose digits match its
-- from_address (inbound) or to_address (outbound).
UPDATE public.communications c
SET contact_id = sub.id
FROM (
  SELECT DISTINCT ON (phone_digits) id, phone_digits
  FROM public.contacts
  WHERE phone_digits IS NOT NULL AND length(phone_digits) >= 10
    AND deleted_at IS NULL
  ORDER BY phone_digits, created_at ASC
) sub
WHERE c.channel = 'phone'
  AND c.contact_id IS NULL
  AND (
    (c.direction = 'inbound'  AND c.from_address IS NOT NULL
       AND right(regexp_replace(c.from_address, '\D', '', 'g'), 10) = right(sub.phone_digits, 10))
    OR
    (c.direction = 'outbound' AND c.to_address IS NOT NULL
       AND right(regexp_replace(c.to_address, '\D', '', 'g'), 10) = right(sub.phone_digits, 10))
  );

-- Also fill in company_id when the contact has one.
UPDATE public.communications c
SET company_id = ct.company_id
FROM public.contacts ct
WHERE c.channel = 'phone'
  AND c.contact_id = ct.id
  AND c.company_id IS NULL
  AND ct.company_id IS NOT NULL;
