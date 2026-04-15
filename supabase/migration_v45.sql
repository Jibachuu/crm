-- Migration v45: Multiple addresses as JSONB arrays
-- Run in Supabase SQL Editor.

-- Companies: replace single actual_address with addresses array
-- Keep actual_address for backward compat, add addresses JSONB
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS addresses JSONB DEFAULT '[]';

-- Migrate existing actual_address into addresses array
UPDATE public.companies
SET addresses = jsonb_build_array(jsonb_build_object('type', 'actual', 'address', actual_address))
WHERE actual_address IS NOT NULL AND actual_address != ''
  AND (addresses IS NULL OR addresses = '[]');

-- Deals: addresses array too
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS addresses JSONB DEFAULT '[]';

-- Migrate existing delivery_address into addresses array
UPDATE public.deals
SET addresses = jsonb_build_array(jsonb_build_object('type', 'delivery', 'address', delivery_address))
WHERE delivery_address IS NOT NULL AND delivery_address != ''
  AND (addresses IS NULL OR addresses = '[]');
