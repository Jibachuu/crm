-- Migration v39: Tiered pricing in invoices + hide total option
-- Run in Supabase SQL Editor.

-- Add price_tiers JSONB to invoice_items for tiered pricing
-- Format: [{ "from_qty": 100, "to_qty": 499, "price": 150 }, { "from_qty": 500, "to_qty": null, "price": 120 }]
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS price_tiers JSONB;

-- Option to hide total on invoice (useful with tiered pricing)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS hide_total BOOLEAN DEFAULT FALSE;
