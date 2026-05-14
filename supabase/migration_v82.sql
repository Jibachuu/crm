-- Migration v82: `kind` on deal_products / lead_products
-- (backlog v6 §4.6 follow-up — позволяет в карточке сделки отмечать
-- товары как «продажа» или «аренда». При генерации договора аренды
-- товары с kind='rental' автоматом попадают в Акт приёма-передачи
-- оборудования (Приложение №3), а 'purchase' — в Спецификацию
-- (Приложение №2). Раньше менеджер вручную перекладывал между
-- таблицами в форме создания договора.)
--
-- Идемпотентно.

ALTER TABLE public.deal_products
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'purchase';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deal_products_kind_check'
  ) THEN
    ALTER TABLE public.deal_products
      ADD CONSTRAINT deal_products_kind_check
      CHECK (kind IN ('purchase', 'rental'));
  END IF;
END $$;

ALTER TABLE public.lead_products
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'purchase';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_products_kind_check'
  ) THEN
    ALTER TABLE public.lead_products
      ADD CONSTRAINT lead_products_kind_check
      CHECK (kind IN ('purchase', 'rental'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_deal_products_kind ON public.deal_products(deal_id, kind);
