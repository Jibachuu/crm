-- Migration v62: КП — hide photos toggle + custom info blocks
-- Run in Supabase SQL Editor

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS hide_photos BOOLEAN DEFAULT false;

-- custom_blocks = [{ id, title, description, photos: [url], position: "top" | "bottom" | "after:CategoryName" }]
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS custom_blocks JSONB DEFAULT '[]';
