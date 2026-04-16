-- Companies: add extra phones, emails, city
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS additional_phone_1 TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS additional_phone_2 TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS additional_phone_3 TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS additional_email_1 TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS additional_email_2 TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS additional_email_3 TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS city TEXT;

-- Contacts: add extra phones, emails
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS additional_phone_1 TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS additional_phone_2 TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS additional_phone_3 TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS additional_email_1 TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS additional_email_2 TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS additional_email_3 TEXT;

-- Cold calls: track which phone/email user selected as primary for conversion
ALTER TABLE public.cold_calls ADD COLUMN IF NOT EXISTS primary_phone TEXT;
ALTER TABLE public.cold_calls ADD COLUMN IF NOT EXISTS primary_email TEXT;
