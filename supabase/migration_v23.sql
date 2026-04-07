-- Migration v23: Production module (Производство)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.order_production (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  worker_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'new',
  tracking_number TEXT,
  shipped_at TIMESTAMPTZ,
  estimated_arrival DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- stage: new, in_progress, discussion, packing, shipped, delivered, review_requested

CREATE TABLE IF NOT EXISTS public.production_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL REFERENCES public.order_production(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id),
  action TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_stage ON public.order_production(stage);
CREATE INDEX IF NOT EXISTS idx_production_deal ON public.order_production(deal_id);
CREATE INDEX IF NOT EXISTS idx_production_log ON public.production_log(production_id);

ALTER TABLE public.order_production ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage production" ON public.order_production FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth manage production_log" ON public.production_log FOR ALL USING (auth.uid() IS NOT NULL);
