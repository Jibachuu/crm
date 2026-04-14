-- Migration v38: Multiple contacts per deal (junction table)
-- Keeps deals.contact_id as "primary contact" for backward compat.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.deal_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(deal_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_contacts_deal ON public.deal_contacts(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_contacts_contact ON public.deal_contacts(contact_id);

-- Migrate existing data: copy current deals.contact_id into junction table
INSERT INTO public.deal_contacts (deal_id, contact_id, is_primary)
SELECT id, contact_id, TRUE FROM public.deals WHERE contact_id IS NOT NULL
ON CONFLICT (deal_id, contact_id) DO NOTHING;
