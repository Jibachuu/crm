-- Migration v44: Add delivery_address to deals
-- Run in Supabase SQL Editor.

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS delivery_address TEXT;
