-- Migration v16: Invoices (Счета) + Supplier settings
-- Run in Supabase SQL Editor

-- Supplier/company settings (реквизиты поставщика — заполняется один раз)
CREATE TABLE IF NOT EXISTS public.supplier_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '',
  inn TEXT NOT NULL DEFAULT '',
  kpp TEXT,
  address TEXT,
  bank_name TEXT,
  bik TEXT,
  account_number TEXT,
  corr_account TEXT,
  director TEXT,
  stamp_url TEXT,
  signature_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage supplier settings" ON public.supplier_settings FOR ALL USING (auth.uid() IS NOT NULL);

-- Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number INTEGER NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_due DATE,
  buyer_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  buyer_name TEXT,
  buyer_inn TEXT,
  buyer_kpp TEXT,
  buyer_address TEXT,
  basis TEXT NOT NULL DEFAULT 'Основной договор',
  status TEXT NOT NULL DEFAULT 'issued',
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  comment TEXT,
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  vat_included BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status: issued, paid, overdue

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'шт',
  price NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total NUMERIC(15, 2) NOT NULL DEFAULT 0
);

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices(invoice_date DESC);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage invoices" ON public.invoices FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users can manage invoice items" ON public.invoice_items FOR ALL USING (auth.uid() IS NOT NULL);
