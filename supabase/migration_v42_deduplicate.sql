-- Migration v42: Deduplicate auto-created leads and contacts
-- Run in Supabase SQL Editor. Review output before committing.

-- 1. Delete duplicate leads: keep oldest lead per contact_id+source, delete rest
DELETE FROM public.leads
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY contact_id, source ORDER BY created_at ASC) AS rn
    FROM public.leads
    WHERE contact_id IS NOT NULL
  ) sub
  WHERE sub.rn > 1
);

-- 2. Find duplicate contacts by phone (same last 10 digits)
-- This is informational — run SELECT first to review, then DELETE if safe
-- SELECT c1.id, c1.full_name, c1.phone, c1.telegram_id, c1.maks_id,
--        c2.id as dup_id, c2.full_name as dup_name, c2.phone as dup_phone
-- FROM contacts c1
-- JOIN contacts c2 ON c1.id < c2.id
--   AND RIGHT(REGEXP_REPLACE(c1.phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(c2.phone, '\D', '', 'g'), 10)
--   AND LENGTH(REGEXP_REPLACE(c1.phone, '\D', '', 'g')) >= 7
-- ORDER BY c1.phone;

-- 3. Delete leads that have no contact or contact has no phone/email/telegram/maks
-- (junk auto-created leads with no useful data)
DELETE FROM public.leads
WHERE source IN ('telegram', 'maks')
  AND status = 'new'
  AND contact_id IS NOT NULL
  AND contact_id IN (
    SELECT id FROM public.contacts
    WHERE phone IS NULL AND email IS NULL
      AND telegram_username IS NULL AND maks_id IS NULL
      AND (full_name IS NULL OR full_name ~ '^\d+$' OR LENGTH(TRIM(full_name)) < 2)
  );

-- 4. Delete orphan contacts (no leads, no deals, no company, no useful data)
DELETE FROM public.contacts
WHERE id NOT IN (SELECT DISTINCT contact_id FROM public.leads WHERE contact_id IS NOT NULL)
  AND id NOT IN (SELECT DISTINCT contact_id FROM public.deals WHERE contact_id IS NOT NULL)
  AND company_id IS NULL
  AND phone IS NULL AND email IS NULL
  AND telegram_username IS NULL
  AND (full_name IS NULL OR full_name ~ '^\d+$' OR LENGTH(TRIM(full_name)) < 2);
