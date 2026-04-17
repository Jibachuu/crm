-- Migration v56: VAT (НДС) support for quotes + survey_discount on leads
-- Run in Supabase SQL Editor.

-- НДС для КП
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS vat_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(15, 2) NOT NULL DEFAULT 0;

-- "Прошёл опрос" на лидах (контакты уже имеют survey_discount из v54)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS survey_discount BOOLEAN NOT NULL DEFAULT FALSE;
