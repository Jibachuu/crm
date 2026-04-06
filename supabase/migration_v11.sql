-- Migration v11: Contracts (Договоры) for companies
-- Run in Supabase SQL Editor

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contract_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS contract_signed_at DATE,
  ADD COLUMN IF NOT EXISTS contract_file_url TEXT,
  ADD COLUMN IF NOT EXISTS contract_file_name TEXT,
  ADD COLUMN IF NOT EXISTS contract_comment TEXT;

-- contract_status values: none, pending, signed, terminated
