-- Survey discount flag on contacts (visible across all linked deals/leads/companies)
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS survey_discount BOOLEAN DEFAULT FALSE;
