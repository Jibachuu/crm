-- Add phone field to users for Novofon caller ID and signatures
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
