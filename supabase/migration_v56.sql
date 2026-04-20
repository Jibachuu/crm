-- Migration v56: Per-quote category descriptions override
-- Run in Supabase SQL Editor

-- Store per-quote category title/description overrides
-- Format: { "Категория": { "title": "...", "description": "..." } }
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS category_overrides JSONB DEFAULT '{}';
