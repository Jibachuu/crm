-- Migration v63: Soft delete for quotes — keep in trash for 30 days
-- Run in Supabase SQL Editor

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Index for efficient filtering of active vs deleted
CREATE INDEX IF NOT EXISTS idx_quotes_deleted_at ON public.quotes(deleted_at);
