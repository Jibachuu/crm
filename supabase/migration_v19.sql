-- Migration v19: Quotes (КП) + product images
-- Run in Supabase SQL Editor

-- Add image_url to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Quotes
CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number SERIAL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  manager_id UUID NOT NULL REFERENCES public.users(id),
  payment_terms TEXT DEFAULT 'предоплата',
  delivery_terms TEXT,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status: draft, sent, accepted, rejected

CREATE TABLE IF NOT EXISTS public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  article TEXT,
  base_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
  client_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(5, 1) NOT NULL DEFAULT 0,
  qty NUMERIC(10, 2) NOT NULL DEFAULT 1,
  sum NUMERIC(15, 2) NOT NULL DEFAULT 0,
  image_url TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotes_company ON public.quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON public.quote_items(quote_id);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage quotes" ON public.quotes FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users manage quote items" ON public.quote_items FOR ALL USING (auth.uid() IS NOT NULL);
