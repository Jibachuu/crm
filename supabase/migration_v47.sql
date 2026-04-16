-- Migration v47: SIP number mapping for Novofon telephony
-- Run in Supabase SQL Editor.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sip_number TEXT;
