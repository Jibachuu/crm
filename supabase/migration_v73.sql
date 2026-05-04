-- Migration v73: small data fixes + small schema additions from backlog v5.
-- Run in Supabase SQL Editor. Idempotent.

-- ─────────────────────────────────────────────────────────────────
-- §1.4.1 — file attachments on notes (communications.channel = 'note')
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS attachment_size BIGINT;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS attachment_type TEXT;

-- ─────────────────────────────────────────────────────────────────
-- §1.2.3 — soap base price 2 990 → 2 900 to match the announced price.
-- ─────────────────────────────────────────────────────────────────
-- Match by category-or-name "мыло" and current price 2990; we don't want
-- to overwrite the price of every soap-like row, only the catalog
-- baseline. If the team has already adjusted some manually, those rows
-- (with prices ≠ 2990) keep their value.
UPDATE public.products
SET base_price = 2900
WHERE base_price = 2990
  AND (
    lower(coalesce(name, '')) LIKE '%мыло%'
    OR lower(coalesce(category, '')) LIKE '%мыло%'
    OR lower(coalesce(subcategory, '')) LIKE '%мыло%'
  );
