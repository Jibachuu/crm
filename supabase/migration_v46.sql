-- Migration v46: Remove unique constraint on products.sku
-- Run in Supabase SQL Editor.

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
DROP INDEX IF EXISTS products_sku_key;
