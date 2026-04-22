-- Migration v64: Custom recipient for quotes without company/contact
-- Run in Supabase SQL Editor

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS custom_recipient TEXT;
