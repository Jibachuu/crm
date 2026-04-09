-- Migration v26: Employee time tracking (check-in / check-out)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  check_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_out TIMESTAMPTZ,
  duration_minutes INTEGER, -- calculated on check-out
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_user ON public.time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON public.time_entries(check_in);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own time entries" ON public.time_entries
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR current_user_role() IN ('admin', 'supervisor'));
CREATE POLICY "Users can insert own time entries" ON public.time_entries
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own time entries" ON public.time_entries
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admin manages all time entries" ON public.time_entries
  FOR ALL TO authenticated USING (current_user_role() IN ('admin', 'supervisor'));
