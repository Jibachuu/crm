-- Migration v33: Cache messenger avatars and usernames on contacts
-- Lets MAX/Telegram avatars and names persist across VPS proxy restarts.
-- Run in Supabase SQL Editor.

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS telegram_username TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS maks_username TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_telegram_username ON public.contacts(telegram_username);
CREATE INDEX IF NOT EXISTS idx_contacts_maks_username ON public.contacts(maks_username);
