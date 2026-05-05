-- Migration v76: multi-contract files per company
-- Run in Supabase SQL Editor. Idempotent.
--
-- companies.contract_file_url / contract_file_name held a single file
-- (legacy single-contract UI). Operators wanted to attach 2+ contracts
-- to one company (2026-05-05). New JSONB column stores an array of
-- {url, name, signed_at, status, comment, uploaded_at}.

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contract_files JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: anyone with the legacy single file should see it as the
-- first item in the new list. Skip rows where contract_files already
-- has entries (re-running the migration is safe).
UPDATE public.companies
SET contract_files = jsonb_build_array(
  jsonb_strip_nulls(jsonb_build_object(
    'url',         contract_file_url,
    'name',        contract_file_name,
    'signed_at',   to_char(contract_signed_at, 'YYYY-MM-DD'),
    'status',      contract_status,
    'comment',     contract_comment,
    'uploaded_at', to_char(coalesce(updated_at, now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ))
)
WHERE contract_file_url IS NOT NULL
  AND length(trim(contract_file_url)) > 0
  AND (contract_files IS NULL OR jsonb_array_length(contract_files) = 0);
