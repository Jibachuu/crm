-- Migration v32: Add bitrix_id to leads table
-- Run in Supabase SQL Editor

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bitrix_id TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_bitrix ON public.leads(bitrix_id);
