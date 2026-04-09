-- Migration v30: Add volume_ml and flavor to products, deal_products, lead_products
-- Run in Supabase SQL Editor

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS volume_ml INTEGER;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS flavor TEXT;

ALTER TABLE public.deal_products ADD COLUMN IF NOT EXISTS volume_ml INTEGER;
ALTER TABLE public.deal_products ADD COLUMN IF NOT EXISTS flavor TEXT;

ALTER TABLE public.lead_products ADD COLUMN IF NOT EXISTS volume_ml INTEGER;
ALTER TABLE public.lead_products ADD COLUMN IF NOT EXISTS flavor TEXT;
