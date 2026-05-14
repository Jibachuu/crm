-- Migration v80: products.excluded_from_invoice
-- (backlog v6 §7.2 — пробники добавляются в Запрос/Заказ сделки для
-- производства, но не должны попадать в счёт). Boolean flag managed in
-- the product card; importFromDealOrder / importFromQuote filter on it.
--
-- Idempotent.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS excluded_from_invoice BOOLEAN NOT NULL DEFAULT false;

-- Seed: any product whose name or category clearly says «пробник» gets
-- the flag automatically. Operators can correct after they've reviewed.
UPDATE public.products
SET excluded_from_invoice = true
WHERE excluded_from_invoice = false
  AND (
    name ~* 'пробник|sample'
    OR category ~* 'пробник|sample'
    OR subcategory ~* 'пробник|sample'
  );
