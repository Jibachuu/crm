-- Migration v62: КП — hide photos per item + custom info blocks
-- Run in Supabase SQL Editor

-- Per-item photo hide flag (variant hide_photo is stored inside JSONB variants)
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS hide_photo BOOLEAN DEFAULT false;

-- custom_blocks = [{ id, title, description, photos: [url], position: "top" | "bottom" | "after:CategoryName" }]
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS custom_blocks JSONB DEFAULT '[]';
