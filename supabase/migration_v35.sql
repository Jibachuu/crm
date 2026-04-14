-- Migration v35: Add delivery_address text field to companies
-- Simple text field for delivery address (user-requested)
-- Run in Supabase SQL Editor.

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS delivery_address TEXT;
