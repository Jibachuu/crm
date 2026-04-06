-- Migration v17: Add buyer_kpp and buyer_address to invoices (if v16 already applied)
-- Run in Supabase SQL Editor

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS buyer_kpp TEXT,
  ADD COLUMN IF NOT EXISTS buyer_address TEXT;
