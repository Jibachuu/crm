-- Migration v48: Contracts and specifications
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_number TEXT NOT NULL,
  contract_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,

  -- Buyer (from company card or PDF requisites)
  buyer_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  buyer_name TEXT NOT NULL, -- "ООО Фазелис"
  buyer_legal_form TEXT, -- "Общество с ограниченной ответственностью"
  buyer_inn TEXT,
  buyer_kpp TEXT,
  buyer_ogrn TEXT,
  buyer_address TEXT,
  buyer_bank_name TEXT,
  buyer_account TEXT,
  buyer_bik TEXT,
  buyer_corr_account TEXT,
  buyer_director_name TEXT, -- "Качанов Дмитрий Викторович"
  buyer_director_title TEXT DEFAULT 'генерального директора', -- должность
  buyer_director_basis TEXT DEFAULT 'Устава', -- основание
  buyer_email TEXT,
  buyer_phone TEXT,
  buyer_short_name TEXT, -- "Качанов Д.В." for signature line

  -- Links
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,

  -- Meta
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'expired')),
  comment TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.specifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  spec_number INTEGER NOT NULL DEFAULT 1,
  spec_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Delivery terms
  delivery_method TEXT DEFAULT 'СДЭК',
  delivery_terms TEXT,
  payment_terms TEXT DEFAULT 'предоплата 100%',
  shipment_days INTEGER DEFAULT 3,

  -- From invoice
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  total_amount NUMERIC DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.specification_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  specification_id UUID NOT NULL REFERENCES public.specifications(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  price NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_contracts_company ON public.contracts(buyer_company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_deal ON public.contracts(deal_id);
CREATE INDEX IF NOT EXISTS idx_specifications_contract ON public.specifications(contract_id);
