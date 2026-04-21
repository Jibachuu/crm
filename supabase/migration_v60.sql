-- Migration v60: Add stock column directly to products (replacing variants)
-- Run in Supabase SQL Editor

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;

-- Migrate existing stock from product_variants (if any) to products
UPDATE public.products p
SET stock = COALESCE((
  SELECT SUM(stock) FROM public.product_variants WHERE product_id = p.id
), 0)
WHERE EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = p.id);
