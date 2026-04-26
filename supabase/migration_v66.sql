-- Migration v66: Multiple contacts per lead (junction table)
-- Mirrors deal_contacts (migration_v38). Keeps leads.contact_id as the
-- "primary contact" for backward compat with auto-leads, KP, conversion.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.lead_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lead_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_contacts_lead ON public.lead_contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_contact ON public.lead_contacts(contact_id);

-- Backfill: copy existing leads.contact_id into the junction so the
-- inline list shows the primary contact alongside any extras.
INSERT INTO public.lead_contacts (lead_id, contact_id, is_primary)
SELECT id, contact_id, TRUE FROM public.leads WHERE contact_id IS NOT NULL
ON CONFLICT (lead_id, contact_id) DO NOTHING;
