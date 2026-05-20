-- Migration v83: invoices.invoice_number — UNIQUE + atomic nextval
-- (Жиба 20.05.2026 — в списке счетов два #35 рядом, клик по номеру
-- открывает другой счёт. Корень: гонка в /api/invoices POST между
-- двумя одновременными запросами read-max → write-max+1. Без UNIQUE
-- они оба пишут одинаковый номер.)
--
-- Идемпотентно.

-- 1. Деда: для каждой группы дубликатов оставляем самый старый, остальным
--    бампим номер на max+rn. Делаем В ОДНОЙ TX, чтобы UNIQUE добавился
--    на чистых данных.
DO $$
DECLARE
  current_max INT;
BEGIN
  SELECT COALESCE(MAX(invoice_number), 0) INTO current_max FROM public.invoices;

  WITH dups AS (
    SELECT id,
           invoice_number,
           ROW_NUMBER() OVER (PARTITION BY invoice_number ORDER BY created_at) - 1 AS rn
    FROM public.invoices
  )
  UPDATE public.invoices i
  SET invoice_number = current_max + d.rn
  FROM dups d
  WHERE i.id = d.id AND d.rn > 0;
END $$;

-- 2. UNIQUE constraint (защита от гонок впредь).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_number_unique'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number);
  END IF;
END $$;

-- 3. Подровняем sequence к max+1 (раньше она была заведена в v16 но
--    кодом не использовалась — code считал max() сам).
SELECT setval(
  'invoice_number_seq',
  GREATEST((SELECT COALESCE(MAX(invoice_number), 0)::bigint FROM public.invoices), 1),
  true
);

-- 4. Функция atomic-инкремента. /api/invoices POST вызывает
--    admin.rpc('next_invoice_number') — nextval() атомарен.
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('invoice_number_seq')::integer;
$$;

-- Дать service_role право вызывать.
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated;
