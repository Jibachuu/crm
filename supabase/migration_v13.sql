-- Migration v13: Add base_price to deal/lead products for discount analytics
-- Run in Supabase SQL Editor

ALTER TABLE public.deal_products
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(15, 2);

ALTER TABLE public.lead_products
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(15, 2);

-- base_price = catalog price (read-only reference)
-- unit_price = sale price (editable, may differ from base)
-- discount_percent = auto-calculated: (base - unit) / base * 100
