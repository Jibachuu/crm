-- Migration v75: clean up duplicate "Email: …" leads from broken watcher
-- Run in Supabase SQL Editor. Idempotent (re-running is a no-op).
--
-- The /opt/email-watcher service had a broken dedup query (looked up
-- existing leads by title containing the email address, while titles
-- are actually "Email: Имя"). After every reboot the service reset
-- its in-memory UID cache and re-processed the last 15 emails →
-- 9+ identical "Email: Жибачу К" leads observed 2026-05-04.
--
-- Watcher fix is in email-watcher/watcher.js (uses contact_id +
-- created_at + status to dedupe). This migration mops up the existing
-- dupes by keeping the OLDEST lead per (contact_id, title) and
-- soft-deleting the rest.

WITH dups AS (
  SELECT id, contact_id, title, created_at,
         row_number() OVER (
           PARTITION BY contact_id, title
           ORDER BY created_at ASC
         ) AS rn
  FROM public.leads
  WHERE source = 'email'
    AND title LIKE 'Email:%'
    AND status IN ('new', 'callback')
    AND deleted_at IS NULL
    AND contact_id IS NOT NULL
)
UPDATE public.leads
SET deleted_at = now()
WHERE id IN (SELECT id FROM dups WHERE rn > 1);

-- Also collapse duplicates that share contact_id + source even if
-- titles diverge slightly (e.g. one "Email: Иван", one "Email: Иван И.")
-- — keep the oldest open lead per contact within the last 30 days.
WITH email_dups AS (
  SELECT id, contact_id, created_at,
         row_number() OVER (
           PARTITION BY contact_id
           ORDER BY created_at ASC
         ) AS rn
  FROM public.leads
  WHERE source = 'email'
    AND status IN ('new', 'callback')
    AND deleted_at IS NULL
    AND contact_id IS NOT NULL
    AND created_at > now() - INTERVAL '30 days'
)
UPDATE public.leads
SET deleted_at = now()
WHERE id IN (SELECT id FROM email_dups WHERE rn > 1);
