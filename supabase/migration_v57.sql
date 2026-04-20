-- Migration v57: New product fields for kind, container, liters + category price tiers
-- Run in Supabase SQL Editor

-- New product fields
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS kind TEXT;          -- вид (e.g. "Black pepper, Tobacco Vanille")
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS container TEXT;     -- тара (e.g. "флакон 250мл", "канистра")
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS liters TEXT;        -- литры (e.g. "5", "10")

-- Default price tiers per category (stored as config)
-- Format: { "tiers": [{ "from_qty": 5, "discount_pct": 5 }, ...] }
CREATE TABLE IF NOT EXISTS public.category_price_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL UNIQUE,
  tiers JSONB NOT NULL DEFAULT '[]',
  unit TEXT NOT NULL DEFAULT 'шт'  -- 'шт' or 'л' (for cosmetics counted in liters)
);

ALTER TABLE public.category_price_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage category_price_tiers" ON public.category_price_tiers FOR ALL USING (auth.uid() IS NOT NULL);

-- Seed default tiers
INSERT INTO public.category_price_tiers (category, tiers, unit) VALUES
  ('Держатели', '[{"from_qty":5,"discount_pct":5},{"from_qty":15,"discount_pct":10},{"from_qty":50,"discount_pct":23},{"from_qty":100,"discount_pct":35}]', 'шт'),
  ('Косметика', '[{"from_qty":10,"discount_pct":3},{"from_qty":20,"discount_pct":5},{"from_qty":30,"discount_pct":7},{"from_qty":50,"discount_pct":10},{"from_qty":75,"discount_pct":12},{"from_qty":100,"discount_pct":13},{"from_qty":150,"discount_pct":15}]', 'л'),
  ('Флаконы', '[{"from_qty":5,"discount_pct":5},{"from_qty":10,"discount_pct":10},{"from_qty":30,"discount_pct":25},{"from_qty":100,"discount_pct":35}]', 'шт')
ON CONFLICT (category) DO NOTHING;
