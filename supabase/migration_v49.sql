ALTER TABLE public.supplier_settings ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE public.supplier_settings ADD COLUMN IF NOT EXISTS ogrnip TEXT;
ALTER TABLE public.supplier_settings ADD COLUMN IF NOT EXISTS director_short TEXT;
ALTER TABLE public.supplier_settings ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.supplier_settings ADD COLUMN IF NOT EXISTS email TEXT;
