-- Migration v22: Block 2 — New fields for companies, contacts, deals
-- Run in Supabase SQL Editor

-- Company fields
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_network BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS network_count INTEGER,
  ADD COLUMN IF NOT EXISTS opened_recently TEXT,
  ADD COLUMN IF NOT EXISTS avg_check NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS delivery_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS timezone TEXT;

-- Contact fields
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS recipient_name TEXT;

-- Deal fields
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS is_network_referral BOOLEAN NOT NULL DEFAULT false;

-- opened_recently values: 'opening', 'working'
