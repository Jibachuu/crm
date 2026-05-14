-- Migration v78: «УФ печать» → «УФ-печать» normalisation across the
-- catalog (backlog v6 §8.7). Migration v72 already handled
-- «с нашим лого» → «с логотипом Havenberg»; v6 surfaces a residual
-- variant — «С УФ печатью и логотипом Havenberg» — where the «УФ-печать»
-- canonical form still lacks the dash. Same plain-text + JSONB
-- combination as v72.
--
-- Idempotent: the `~*` predicate skips rows that are already normalised.
--
-- Patterns matched (case-insensitive, only when not already followed by a
-- dash):
--   «УФ печать» / «УФ Печать» / «уф печать»  → «УФ-печать»
--   «УФ печатью»                             → «УФ-печатью»
--   «УФ печатей»                             → «УФ-печатей»
-- The negative lookahead via `(?!-)` keeps already-correct values intact.

-- ─── Plain text columns ───
UPDATE public.products
SET name = regexp_replace(name, 'УФ\s+(печат)', 'УФ-\1', 'gi')
WHERE name ~* 'уф\s+печат';

UPDATE public.invoice_items
SET name = regexp_replace(name, 'УФ\s+(печат)', 'УФ-\1', 'gi')
WHERE name ~* 'уф\s+печат';

UPDATE public.specification_items
SET name = regexp_replace(name, 'УФ\s+(печат)', 'УФ-\1', 'gi')
WHERE name ~* 'уф\s+печат';

UPDATE public.quote_items
SET name = regexp_replace(name, 'УФ\s+(печат)', 'УФ-\1', 'gi')
WHERE name ~* 'уф\s+печат';

-- ─── JSONB-stored labels ───
UPDATE public.product_variants
SET attributes = regexp_replace(attributes::text, 'УФ\s+(печат)', 'УФ-\1', 'gi')::jsonb
WHERE attributes::text ~* 'уф\s+печат';

UPDATE public.lead_products
SET variants = regexp_replace(variants::text, 'УФ\s+(печат)', 'УФ-\1', 'gi')::jsonb
WHERE variants::text ~* 'уф\s+печат';

UPDATE public.deal_products
SET variants = regexp_replace(variants::text, 'УФ\s+(печат)', 'УФ-\1', 'gi')::jsonb
WHERE variants::text ~* 'уф\s+печат';

UPDATE public.quote_items
SET variants = regexp_replace(variants::text, 'УФ\s+(печат)', 'УФ-\1', 'gi')::jsonb
WHERE variants::text ~* 'уф\s+печат';
