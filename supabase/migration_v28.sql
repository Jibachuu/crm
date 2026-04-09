-- Migration v28: Link email signatures to managers
-- Run in Supabase SQL Editor

ALTER TABLE public.email_signatures ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_email_signatures_user ON public.email_signatures(user_id);
