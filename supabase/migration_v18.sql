-- Migration v18: Extend communications for unified history
-- Run in Supabase SQL Editor

-- Add direct FK fields for company/contact/deal (alongside existing entity_type/entity_id)
ALTER TABLE public.communications
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- Rename body → content alias (body still works, content is the new standard)
-- We keep body as-is for backward compat and use COALESCE in queries

CREATE INDEX IF NOT EXISTS idx_comms_company ON public.communications(company_id);
CREATE INDEX IF NOT EXISTS idx_comms_contact ON public.communications(contact_id);
CREATE INDEX IF NOT EXISTS idx_comms_deal ON public.communications(deal_id);
CREATE INDEX IF NOT EXISTS idx_comms_created ON public.communications(created_at DESC);

-- Allow 'internal' as channel value
ALTER TYPE communication_channel ADD VALUE IF NOT EXISTS 'internal';
