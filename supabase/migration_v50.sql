-- Add company_status column for "Статус" from CSV (active/liquidated etc.)
ALTER TABLE public.cold_calls ADD COLUMN IF NOT EXISTS company_status TEXT;
