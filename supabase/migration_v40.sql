-- Migration v40: Cold calling ("Прозвон") module
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.cold_calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Status: waiting, lead, ndz (не дозвонился), refused
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'lead', 'ndz', 'refused')),

  -- Company info (imported from spreadsheet)
  company_name TEXT,
  inn TEXT,
  kpp TEXT,
  ogrn TEXT,
  city TEXT,
  region TEXT,
  legal_address TEXT,
  postal_code TEXT,
  company_type TEXT,
  registration_date TEXT,
  main_okved TEXT,
  additional_okveds TEXT,
  director_name TEXT,
  director_inn TEXT,
  director_gender TEXT,
  director_position TEXT,
  director_since TEXT,
  years_since_registration INTEGER,

  -- Contact info
  main_phone TEXT,
  additional_phone_1 TEXT,
  additional_phone_2 TEXT,
  additional_phone_3 TEXT,
  main_email TEXT,
  additional_email_1 TEXT,
  additional_email_2 TEXT,
  additional_email_3 TEXT,
  main_website TEXT,
  additional_website_1 TEXT,
  additional_website_2 TEXT,
  additional_website_3 TEXT,

  -- Founders & SRO
  founders TEXT,
  sro_nopriz TEXT,
  sro_nostroy TEXT,

  -- Revenue & profit
  revenue_2022 NUMERIC,
  revenue_2023 NUMERIC,
  revenue_2024 NUMERIC,
  revenue_2025 NUMERIC,
  profit_2022 NUMERIC,
  profit_2023 NUMERIC,
  profit_2024 NUMERIC,
  profit_2025 NUMERIC,

  -- Call result fields
  call_reached BOOLEAN DEFAULT FALSE,
  discovered_phone TEXT,
  discovered_email TEXT,
  discovered_name TEXT,
  discovered_position TEXT,
  comment TEXT,

  -- Conversion tracking
  converted_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  converted_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  converted_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,

  -- Meta
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cold_calls_status ON public.cold_calls(status);
CREATE INDEX IF NOT EXISTS idx_cold_calls_assigned ON public.cold_calls(assigned_to);
