-- Migration v8: Replace open tracking with reply tracking
-- Run in Supabase SQL Editor

-- Add reply tracking to recipients
ALTER TABLE public.email_recipients
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

-- Add reply count to campaigns
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS replied_count INTEGER NOT NULL DEFAULT 0;

-- Drop open tracking columns (no longer used — Gmail blocks pixels)
ALTER TABLE public.email_recipients
  DROP COLUMN IF EXISTS opened_at,
  DROP COLUMN IF EXISTS open_count;

ALTER TABLE public.email_campaigns
  DROP COLUMN IF EXISTS opened_count;

-- Add attachments to campaigns (array of {filename, url, contentType, size})
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
