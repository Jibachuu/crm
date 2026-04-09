-- Migration v27: Add last_seen_at to users for online status
-- Run in Supabase SQL Editor

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
