-- Migration v71: extend soft-delete to samples
-- /samples page query already filters .is("deleted_at", null) (commit
-- 040e8b5 in the public-link epic), but the column was never added in
-- v67 — so the filter resolves to 0 rows and the list looks empty.
--
-- Run in Supabase SQL Editor.

ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_samples_active ON public.samples(id) WHERE deleted_at IS NULL;
