-- Migration v65: Add variants JSONB to lead_products and deal_products
-- Mirrors the variants column on quote_items (added in v61) so order items
-- in leads/deals can carry multi-option bottle variants (УФ, лого, наклейка).
-- Run in Supabase SQL Editor

ALTER TABLE public.lead_products ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]';
ALTER TABLE public.deal_products ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]';
-- variants = [{ label, price, quantity, sum, image_url? }, ...]
