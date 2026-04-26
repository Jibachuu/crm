-- Migration v68: Optional lead/deal links on samples + public read access
-- Run in Supabase SQL Editor.

ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_samples_lead_id ON public.samples(lead_id);
CREATE INDEX IF NOT EXISTS idx_samples_deal_id ON public.samples(deal_id);

-- Public sample page (/s/{id}) is rendered server-side via service-role
-- admin client, so no RLS policy change is required. The id itself is a
-- UUID — effectively unguessable.
