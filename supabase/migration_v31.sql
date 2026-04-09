-- Migration v31: Add direct FK columns to communications + bitrix_id to deals
-- Run in Supabase SQL Editor

-- Direct FK for faster queries and timeline across entities
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS bitrix_deal_id TEXT;

CREATE INDEX IF NOT EXISTS idx_comm_company ON public.communications(company_id);
CREATE INDEX IF NOT EXISTS idx_comm_deal ON public.communications(deal_id);
CREATE INDEX IF NOT EXISTS idx_comm_lead ON public.communications(lead_id);
CREATE INDEX IF NOT EXISTS idx_comm_contact ON public.communications(contact_id);
CREATE INDEX IF NOT EXISTS idx_comm_external ON public.communications(external_id);

-- Bitrix ID on deals for import mapping
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS bitrix_id TEXT;
CREATE INDEX IF NOT EXISTS idx_deals_bitrix ON public.deals(bitrix_id);

-- Populate company_id/deal_id/lead_id/contact_id from entity_type+entity_id for existing data
UPDATE public.communications SET company_id = entity_id WHERE entity_type = 'company' AND company_id IS NULL;
UPDATE public.communications SET deal_id = entity_id WHERE entity_type = 'deal' AND deal_id IS NULL;
UPDATE public.communications SET lead_id = entity_id WHERE entity_type = 'lead' AND lead_id IS NULL;
UPDATE public.communications SET contact_id = entity_id WHERE entity_type = 'contact' AND contact_id IS NULL;
