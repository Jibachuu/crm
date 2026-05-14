-- Migration v81: contract types — supply / invoice-contract / rental
-- (backlog v6 §4.5 + §4.6 — два новых модуля договоров: компактный
-- «Счёт-договор» (счёт + договор на одной странице) и «Договор аренды»
-- (гибрид поставки + аренды оборудования с двумя приложениями).)
--
-- Idempotent.

-- ─────────────────────────────────────────────────────────────────
-- contract_type marker on the existing contracts table
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_type TEXT NOT NULL DEFAULT 'supply';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_contract_type_check'
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_contract_type_check
      CHECK (contract_type IN ('supply', 'invoice_contract', 'rental'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contracts_contract_type ON public.contracts(contract_type);

-- ─────────────────────────────────────────────────────────────────
-- Invoice-contract fields (один компактный документ: счёт + договор)
-- ─────────────────────────────────────────────────────────────────
-- §3 образца: «Покупатель в течение 5 (Пяти) дней перечисляет … Поставщик
-- в течение 3 (Трёх) рабочих дней после поступления оплаты отправляет».
-- §4: «Счёт-договор действителен в течение пяти банковских дней».
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS prepayment_days INTEGER DEFAULT 5;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS shipment_days_after_payment INTEGER DEFAULT 3;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS validity_bank_days INTEGER DEFAULT 5;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────
-- Rental fields
-- ─────────────────────────────────────────────────────────────────
-- §5.2.1 «Заявка содержит периодичность поставок» — Жиба хочет, чтобы
-- условие про «как часто должны брать товар» вставлялось в договор.
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS purchase_frequency_terms TEXT;
-- Адрес установки оборудования (для Акта приёма-передачи, §4.4 договора аренды).
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS equipment_location_address TEXT;
-- §1 — основание подписи покупателя бывает «доверенности №X от …», для
-- договора аренды это конкретная строка ("доверенности №30 от 10.12.2025").
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS buyer_director_basis_full TEXT;

-- Equipment items table — отдельно от specification_items, потому что у
-- них другой смысл: оценочная стоимость на случай невозврата, не цена.
CREATE TABLE IF NOT EXISTS public.contract_equipment_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  valuation NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_equipment_items_contract
  ON public.contract_equipment_items(contract_id);

ALTER TABLE public.contract_equipment_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contract_equipment_items'
      AND policyname = 'Auth manage contract_equipment_items'
  ) THEN
    CREATE POLICY "Auth manage contract_equipment_items"
      ON public.contract_equipment_items FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
