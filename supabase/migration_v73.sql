-- Migration v73: small data fixes + small schema additions from backlog v5.
-- Run in Supabase SQL Editor. Idempotent.

-- ─────────────────────────────────────────────────────────────────
-- §1.4.1 — file attachments on notes (communications.channel = 'note')
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS attachment_size BIGINT;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS attachment_type TEXT;

-- ─────────────────────────────────────────────────────────────────
-- §5 — УПД status code (1 or 2). Backlog v5: bookkeeper flagged that
-- the document was missing the "Статус: 1/2" mark in the top-left
-- corner. Defaulting to 2 (передаточный документ only) since IP on
-- УСН doesn't issue VAT счёт-фактуры.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.upd ADD COLUMN IF NOT EXISTS status_code SMALLINT DEFAULT 2;
UPDATE public.upd SET status_code = 2 WHERE status_code IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- §2.1.3 / §2.1.7 — supplier_settings extras for contract requisites
-- ─────────────────────────────────────────────────────────────────
-- Separate "адрес для договоров" (Казань) from прописки ИП (Сарапул)
-- and store ОГРНИП registration date so УПД prints it instead of
-- "_______________".
ALTER TABLE public.supplier_settings ADD COLUMN IF NOT EXISTS contract_address TEXT;
ALTER TABLE public.supplier_settings ADD COLUMN IF NOT EXISTS ogrnip_date DATE;

-- ─────────────────────────────────────────────────────────────────
-- §3 — addresses M:N (множество адресов на одну компанию)
-- ─────────────────────────────────────────────────────────────────
-- Adding a delivery address from a deal must NOT overwrite any
-- existing address — every address is valuable. Old single-address
-- columns (legal/actual/delivery_address) stay as the canonical
-- "primary" copies but additional rows live here.
CREATE TABLE IF NOT EXISTS public.addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'delivery' CHECK (kind IN ('legal','delivery','office','other')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addresses_company ON public.addresses(company_id);

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage addresses" ON public.addresses FOR ALL USING (auth.uid() IS NOT NULL);

-- Per-deal pointer to the chosen delivery address (NULL = ad-hoc, see
-- deals.delivery_address_text). FK is SET NULL on delete so removing
-- an address row doesn't lose the deal.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS delivery_address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS delivery_address_text TEXT;

-- Backfill: for every company that has a delivery_address column value,
-- create a corresponding addresses row (idempotent — guarded by the
-- NOT EXISTS check on (company_id, address, kind)).
INSERT INTO public.addresses (company_id, address, kind, is_default)
SELECT c.id, c.delivery_address, 'delivery', true
FROM public.companies c
WHERE c.delivery_address IS NOT NULL
  AND length(trim(c.delivery_address)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.addresses a
    WHERE a.company_id = c.id
      AND a.address = c.delivery_address
      AND a.kind = 'delivery'
  );

-- ─────────────────────────────────────────────────────────────────
-- §2.1.7 — swap mislabelled corr-account ↔ settlement-account on
-- existing contract rows. Russian convention: р/с (settlement) starts
-- with 40/41/42; к/с (corr) always starts with 30101/30102/304.
-- ─────────────────────────────────────────────────────────────────
UPDATE public.contracts
SET buyer_account = buyer_corr_account,
    buyer_corr_account = buyer_account
WHERE buyer_account ~ '^(30101|30102|304)'
  AND buyer_corr_account ~ '^(40|41|42)';

-- ─────────────────────────────────────────────────────────────────
-- §1.2.3 — soap base price 2 990 → 2 900 to match the announced price.
-- ─────────────────────────────────────────────────────────────────
-- Match by category-or-name "мыло" and current price 2990; we don't want
-- to overwrite the price of every soap-like row, only the catalog
-- baseline. If the team has already adjusted some manually, those rows
-- (with prices ≠ 2990) keep their value.
UPDATE public.products
SET base_price = 2900
WHERE base_price = 2990
  AND (
    lower(coalesce(name, '')) LIKE '%мыло%'
    OR lower(coalesce(category, '')) LIKE '%мыло%'
    OR lower(coalesce(subcategory, '')) LIKE '%мыло%'
  );
