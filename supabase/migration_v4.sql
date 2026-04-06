-- Migration v4: Replace lead_status enum with new pipeline stages
-- Run this in Supabase SQL Editor

BEGIN;

-- 1. Create new enum type
CREATE TYPE lead_status_new AS ENUM (
  'new',
  'callback',
  'in_progress',
  'samples',
  'samples_shipped',
  'invoice',
  'rejected',
  'converted'
);

-- 2. Drop the default first (it references the old enum type)
ALTER TABLE leads ALTER COLUMN status DROP DEFAULT;

-- 3. Migrate existing data
ALTER TABLE leads
  ALTER COLUMN status TYPE lead_status_new
  USING (
    CASE status::text
      WHEN 'new'         THEN 'new'
      WHEN 'in_progress' THEN 'in_progress'
      WHEN 'qualified'   THEN 'in_progress'
      WHEN 'unqualified' THEN 'rejected'
      WHEN 'converted'   THEN 'converted'
      ELSE 'new'
    END
  )::lead_status_new;

-- 4. Restore default with new type
ALTER TABLE leads ALTER COLUMN status SET DEFAULT 'new'::lead_status_new;

-- 5. Drop old type, rename new one
DROP TYPE lead_status;
ALTER TYPE lead_status_new RENAME TO lead_status;

COMMIT;
