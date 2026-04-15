-- Migration v43: Add lead_id to deal_files (rename to entity_files conceptually)
-- Run in Supabase SQL Editor.

ALTER TABLE public.deal_files ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.deal_files ALTER COLUMN deal_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deal_files_lead_id ON public.deal_files(lead_id);
