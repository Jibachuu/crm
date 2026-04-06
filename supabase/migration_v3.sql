-- Migration v3: New fields for companies, contacts, leads
-- Run this in Supabase SQL Editor

-- ============================================================
-- COMPANIES: add new fields
-- ============================================================
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ogrn        text,
  ADD COLUMN IF NOT EXISTS kpp         text,
  ADD COLUMN IF NOT EXISTS city        text,
  ADD COLUMN IF NOT EXISTS region      text,
  ADD COLUMN IF NOT EXISTS director    text,
  ADD COLUMN IF NOT EXISTS activity    text,
  ADD COLUMN IF NOT EXISTS need        text;

-- note: inn, legal_address, website already exist

-- ============================================================
-- CONTACTS: add new fields
-- ============================================================
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS last_name        text,
  ADD COLUMN IF NOT EXISTS middle_name      text,
  ADD COLUMN IF NOT EXISTS phone_mobile     text,
  ADD COLUMN IF NOT EXISTS phone_other      text,
  ADD COLUMN IF NOT EXISTS email_other      text,
  ADD COLUMN IF NOT EXISTS telegram_username text;

-- note: telegram_id already exists

-- ============================================================
-- LEADS: add new fields
-- ============================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS telegram_username text,
  ADD COLUMN IF NOT EXISTS had_call         text;

-- ============================================================
-- Done
-- ============================================================
