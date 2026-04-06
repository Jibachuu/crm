-- ============================================================
-- CRM Migration v2
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ============================================================
-- СПРАВОЧНИКИ (Directories)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.venue_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.venue_types (name, sort_order) VALUES
  ('Ресторан', 1),
  ('Отель', 2),
  ('Салон красоты', 3),
  ('Спа', 4),
  ('Коворкинг', 5),
  ('Бизнес-центр', 6),
  ('Другое', 99);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.lead_sources (name, sort_order) VALUES
  ('Сайт', 1),
  ('Рекомендация', 2),
  ('Холодный звонок', 3),
  ('Соцсети', 4),
  ('Выставка', 5),
  ('Другое', 99);

-- ============================================================
-- COMPANY FIELDS
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS venue_type_id UUID REFERENCES public.venue_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bathrooms_count INTEGER,
  ADD COLUMN IF NOT EXISTS rooms_count INTEGER,
  ADD COLUMN IF NOT EXISTS masters_count INTEGER,
  ADD COLUMN IF NOT EXISTS cabinets_count INTEGER;

-- ============================================================
-- DEAL FIELDS
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS objections TEXT;

-- ============================================================
-- PRODUCT BLOCKS (request = Запрос, order = Заказ)
-- ============================================================

ALTER TABLE public.lead_products
  ADD COLUMN IF NOT EXISTS product_block TEXT NOT NULL DEFAULT 'request';

ALTER TABLE public.deal_products
  ADD COLUMN IF NOT EXISTS product_block TEXT NOT NULL DEFAULT 'request';

-- ============================================================
-- RLS FOR NEW TABLES
-- ============================================================

ALTER TABLE public.venue_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read venue_types" ON public.venue_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages venue_types" ON public.venue_types
  FOR ALL TO authenticated USING (current_user_role() = 'admin');

CREATE POLICY "All authenticated can read suppliers" ON public.suppliers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages suppliers" ON public.suppliers
  FOR ALL TO authenticated USING (current_user_role() = 'admin');

CREATE POLICY "All authenticated can read lead_sources" ON public.lead_sources
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages lead_sources" ON public.lead_sources
  FOR ALL TO authenticated USING (current_user_role() = 'admin');

-- ============================================================
-- FIX DELETE RLS — allow creators and supervisors to delete
-- ============================================================

DROP POLICY IF EXISTS "Admin can delete leads" ON public.leads;
CREATE POLICY "Can delete own leads or admin/supervisor" ON public.leads
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin', 'supervisor') OR created_by = auth.uid());

DROP POLICY IF EXISTS "Admin can delete deals" ON public.deals;
CREATE POLICY "Can delete own deals or admin/supervisor" ON public.deals
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin', 'supervisor') OR created_by = auth.uid());

DROP POLICY IF EXISTS "Admin can delete contacts" ON public.contacts;
CREATE POLICY "Can delete own contacts or admin/supervisor" ON public.contacts
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin', 'supervisor') OR created_by = auth.uid());

DROP POLICY IF EXISTS "Admin can delete companies" ON public.companies;
CREATE POLICY "Can delete own companies or admin/supervisor" ON public.companies
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin', 'supervisor') OR created_by = auth.uid());
