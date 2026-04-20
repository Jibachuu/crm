-- Migration v58: Bottle variants + multiple price columns in КП
-- Run in Supabase SQL Editor

-- Bottle variant type per quote/invoice item (for Флаконы category)
-- Values: 'none', 'uv', 'uv_logo', 'sticker', 'sticker_logo'
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS bottle_variant TEXT;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS bottle_variant TEXT;

-- Multiple price columns in КП
-- column_index groups items into columns; column_titles stores column names
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS column_index INTEGER DEFAULT 0;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS column_titles JSONB DEFAULT '{}';
