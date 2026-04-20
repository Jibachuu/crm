-- Migration v59: УПД (closing documents) + Gallery
-- Run in Supabase SQL Editor

-- ═══ УПД (Universal Transfer Document) ═══

CREATE SEQUENCE IF NOT EXISTS upd_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.upd (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upd_number INTEGER DEFAULT nextval('upd_number_seq'),
  upd_date DATE DEFAULT CURRENT_DATE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  buyer_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  buyer_name TEXT,
  buyer_inn TEXT,
  buyer_kpp TEXT,
  buyer_address TEXT,
  basis TEXT DEFAULT 'Основной договор',
  status TEXT DEFAULT 'draft',
  total_amount NUMERIC(15,2) DEFAULT 0,
  vat_included BOOLEAN DEFAULT false,
  comment TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.upd_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upd_id UUID REFERENCES public.upd(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity NUMERIC(15,3) DEFAULT 1,
  unit TEXT DEFAULT 'шт',
  price NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

ALTER TABLE public.upd ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upd_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage upd" ON public.upd FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth manage upd_items" ON public.upd_items FOR ALL USING (auth.uid() IS NOT NULL);

-- ═══ Gallery ═══

CREATE TABLE IF NOT EXISTS public.gallery_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gallery_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES public.gallery_folders(id) ON DELETE CASCADE,
  name TEXT,
  description TEXT,
  url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gallery_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage gallery_folders" ON public.gallery_folders FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth manage gallery_photos" ON public.gallery_photos FOR ALL USING (auth.uid() IS NOT NULL);
