-- Migration v77: backfill communications dedicated FK columns
-- (backlog v6 §9.3 — deal notes "disappear" because they were inserted with
-- entity_type='deal' + entity_id=<deal-uuid> but deal_id was left NULL, and
-- the timeline filter's embedded `and(entity_type, entity_id)` arm was not
-- matching them reliably. The /api/communications POST now auto-fills the FK,
-- but old rows from before that fix still need patching.)
--
-- Idempotent — `WHERE … IS NULL` makes re-running a no-op.

UPDATE public.communications SET deal_id    = entity_id WHERE entity_type = 'deal'    AND deal_id    IS NULL AND entity_id IS NOT NULL;
UPDATE public.communications SET company_id = entity_id WHERE entity_type = 'company' AND company_id IS NULL AND entity_id IS NOT NULL;
UPDATE public.communications SET lead_id    = entity_id WHERE entity_type = 'lead'    AND lead_id    IS NULL AND entity_id IS NOT NULL;
UPDATE public.communications SET contact_id = entity_id WHERE entity_type = 'contact' AND contact_id IS NULL AND entity_id IS NOT NULL;
