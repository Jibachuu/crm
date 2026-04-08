-- Migration v24: MAX messenger field for contacts
-- Run in Supabase SQL Editor

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS maks_id TEXT;
