-- Migration v79: brand_name on companies + «некачественный» lead status
-- (backlog v6 «Дополнения»: brand/venue display name separate from the
-- legal name, and a spam/«некачественный» status for lead triage).
--
-- Idempotent.

-- ─── companies.brand_name ───
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS brand_name TEXT;

-- ─── leads.status: add 'spam' value ───
-- Lead status started as text in early migrations and was migrated to an
-- enum in v22+; the enum's name is `lead_status`. Adding an enum value is
-- safe and idempotent via the standard guard.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'spam'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'lead_status')
    ) THEN
      ALTER TYPE public.lead_status ADD VALUE 'spam';
    END IF;
  END IF;
END $$;
