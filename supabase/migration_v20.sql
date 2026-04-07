-- Migration v20: Category descriptions for КП, logo, manager signatures
-- Run in Supabase SQL Editor

-- Category selling descriptions (for КП headers)
CREATE TABLE IF NOT EXISTS public.category_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.category_descriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage category_descriptions" ON public.category_descriptions FOR ALL USING (auth.uid() IS NOT NULL);

-- Logo URL in supplier_settings
ALTER TABLE public.supplier_settings
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Link signatures to managers
ALTER TABLE public.email_signatures
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
