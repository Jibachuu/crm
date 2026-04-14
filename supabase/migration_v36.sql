-- Migration v36: Add is_pinned flag to communications (for pinned notes)
-- Run in Supabase SQL Editor.

ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_communications_pinned ON public.communications(is_pinned) WHERE is_pinned = TRUE;
