-- Migration v41: Tiered pricing in quotes (КП) + hide total option
-- Run in Supabase SQL Editor.

ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS price_tiers JSONB;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS hide_total BOOLEAN DEFAULT FALSE;
