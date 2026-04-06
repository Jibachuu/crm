-- Migration v7: Email tracking (opens)
-- Run in Supabase SQL Editor

ALTER TABLE public.email_recipients
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS opened_count INTEGER NOT NULL DEFAULT 0;
