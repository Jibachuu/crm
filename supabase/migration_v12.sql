-- Migration v12: Samples (Пробники)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  venue_name TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_phone TEXT,
  materials TEXT,
  delivery_type TEXT,
  delivery_address TEXT,
  track_number TEXT,
  sent_date DATE,
  arrival_date DATE,
  status TEXT NOT NULL DEFAULT 'new',
  comment TEXT,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  logist_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  client_notified BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status values: new, sent, in_transit, delivered, refused
-- delivery_type values: pvz, door

CREATE INDEX IF NOT EXISTS idx_samples_status ON public.samples(status);
CREATE INDEX IF NOT EXISTS idx_samples_assigned ON public.samples(assigned_to);
CREATE INDEX IF NOT EXISTS idx_samples_company ON public.samples(company_id);

ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage samples"
  ON public.samples FOR ALL USING (auth.uid() IS NOT NULL);
