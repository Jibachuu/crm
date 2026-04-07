-- Migration v21: Block 1 — product snapshot fields + lifecycle
-- Run in Supabase SQL Editor

-- Add flavor, volume, lifecycle_days to deal/lead products
ALTER TABLE public.deal_products
  ADD COLUMN IF NOT EXISTS flavor TEXT,
  ADD COLUMN IF NOT EXISTS volume TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_days INTEGER;

ALTER TABLE public.lead_products
  ADD COLUMN IF NOT EXISTS flavor TEXT,
  ADD COLUMN IF NOT EXISTS volume TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_days INTEGER;

-- Ensure products table has flavor and volume
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS flavor TEXT,
  ADD COLUMN IF NOT EXISTS volume TEXT;
