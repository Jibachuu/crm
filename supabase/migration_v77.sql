-- Migration v77: backfill communications dedicated FK columns
-- (backlog v6 §9.3 — deal notes "disappear" because they were inserted with
-- entity_type='deal' + entity_id=<deal-uuid> but deal_id was left NULL, and
-- the timeline filter's embedded `and(entity_type, entity_id)` arm was not
-- matching them reliably. The /api/communications POST now auto-fills the FK,
-- but old rows from before that fix still need patching.)
--
-- Idempotent — `WHERE … IS NULL` makes re-running a no-op.
--
-- NB: communications.{deal,company,lead,contact}_id are FKs with ON DELETE
-- SET NULL, but the (entity_type, entity_id) pair is NOT enforced — when a
-- parent row was hard-deleted (some early code paths didn't soft-delete)
-- the entity_id is now an orphan. Backfilling those would trip FK
-- violations, so we filter via EXISTS against the parent table.

UPDATE public.communications c
SET deal_id = c.entity_id
WHERE c.entity_type = 'deal'
  AND c.deal_id IS NULL
  AND c.entity_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = c.entity_id);

UPDATE public.communications c
SET company_id = c.entity_id
WHERE c.entity_type = 'company'
  AND c.company_id IS NULL
  AND c.entity_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.companies x WHERE x.id = c.entity_id);

UPDATE public.communications c
SET lead_id = c.entity_id
WHERE c.entity_type = 'lead'
  AND c.lead_id IS NULL
  AND c.entity_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.leads x WHERE x.id = c.entity_id);

UPDATE public.communications c
SET contact_id = c.entity_id
WHERE c.entity_type = 'contact'
  AND c.contact_id IS NULL
  AND c.entity_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.contacts x WHERE x.id = c.entity_id);
