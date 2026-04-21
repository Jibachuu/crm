-- Migration v61: Multiple bottle variants per quote item (with own price and photo)
-- Run in Supabase SQL Editor

ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]';
-- variants = [{ label: string, price: number, quantity: number, sum: number, image_url: string | null }, ...]
