-- v85: template_variant for contracts and invoices.
-- Lets the manager choose between the standard layout and a Havenberg-flavoured
-- one (extra clauses 5.4/5.5/6.6 about Havenberg-branded bottles for contracts;
-- 2-page «оферта» layout with terms attached for invoices). Defaults to
-- 'standard' so every existing record keeps printing exactly as before.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS template_variant text NOT NULL DEFAULT 'standard';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS template_variant text NOT NULL DEFAULT 'standard';

-- Light validation — keep typos out without locking us into the current set.
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_template_variant_chk;
ALTER TABLE contracts ADD CONSTRAINT contracts_template_variant_chk
  CHECK (template_variant IN ('standard', 'havenberg'));

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_template_variant_chk;
ALTER TABLE invoices ADD CONSTRAINT invoices_template_variant_chk
  CHECK (template_variant IN ('standard', 'offer'));
