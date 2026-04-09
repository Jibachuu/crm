-- Migration v25: Sales Funnels, Funnel Stages, Stage Automations
-- Run in Supabase SQL Editor

BEGIN;

-- ============================================================
-- 1. FUNNELS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.funnels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('lead', 'deal')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read funnels" ON public.funnels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages funnels" ON public.funnels FOR ALL TO authenticated USING (current_user_role() IN ('admin', 'supervisor'));

-- ============================================================
-- 2. FUNNEL STAGES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.funnel_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#378ADD',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_final BOOLEAN NOT NULL DEFAULT false,
  is_success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funnel_stages_funnel ON public.funnel_stages(funnel_id);

ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read funnel_stages" ON public.funnel_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages funnel_stages" ON public.funnel_stages FOR ALL TO authenticated USING (current_user_role() IN ('admin', 'supervisor'));

-- ============================================================
-- 3. STAGE AUTOMATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stage_automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_id UUID NOT NULL REFERENCES public.funnel_stages(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL CHECK (trigger IN ('on_enter', 'on_day_N', 'daily_until_changed')),
  delay_days INTEGER NOT NULL DEFAULT 0,
  task_title_template TEXT NOT NULL,
  assignee_role TEXT NOT NULL DEFAULT 'manager' CHECK (assignee_role IN ('manager', 'worker', 'head')),
  is_repeating BOOLEAN NOT NULL DEFAULT false,
  max_repeats INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stage_automations_stage ON public.stage_automations(stage_id);

ALTER TABLE public.stage_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read stage_automations" ON public.stage_automations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages stage_automations" ON public.stage_automations FOR ALL TO authenticated USING (current_user_role() IN ('admin', 'supervisor'));

-- ============================================================
-- 4. ADD funnel_id AND stage_id TO leads AND deals
-- ============================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES public.funnels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.funnel_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES public.funnels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.funnel_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_funnel ON public.leads(funnel_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_funnel ON public.deals(funnel_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON public.deals(stage_id);

-- Add stage_changed_at to track when stage was last changed (for automations)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ DEFAULT now();

-- ============================================================
-- 5. INSERT FUNNELS AND STAGES
-- ============================================================

-- FUNNEL A: Incoming / Brands (leads)
INSERT INTO public.funnels (id, name, type, is_default) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Воронка А — Входящие / Бренды', 'lead', true);

INSERT INTO public.funnel_stages (funnel_id, name, slug, color, sort_order, is_final, is_success) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Новый / первый контакт', 'new_contact', '#378ADD', 1, false, false),
  ('a0000000-0000-0000-0000-000000000001', 'Квалификация', 'qualification', '#378ADD', 2, false, false),
  ('a0000000-0000-0000-0000-000000000001', 'Спящий', 'sleeping', '#888780', 3, true, false),
  ('a0000000-0000-0000-0000-000000000001', 'Отказ', 'rejected', '#E24B4A', 4, true, false),
  ('a0000000-0000-0000-0000-000000000001', 'Конвертирован', 'converted', '#639922', 5, true, true);

-- FUNNEL B: Cold / HoReCa / Holders (leads)
INSERT INTO public.funnels (id, name, type, is_default) VALUES
  ('b0000000-0000-0000-0000-000000000002', 'Воронка Б — Холодный / HoReCa', 'lead', false);

INSERT INTO public.funnel_stages (funnel_id, name, slug, color, sort_order, is_final, is_success) VALUES
  ('b0000000-0000-0000-0000-000000000002', 'Новый / первый контакт', 'new_contact', '#378ADD', 1, false, false),
  ('b0000000-0000-0000-0000-000000000002', 'Пробники отправлены', 'probniki', '#EF9F27', 2, false, false),
  ('b0000000-0000-0000-0000-000000000002', 'Квалификация', 'qualification', '#378ADD', 3, false, false),
  ('b0000000-0000-0000-0000-000000000002', 'Спящий', 'sleeping', '#888780', 4, true, false),
  ('b0000000-0000-0000-0000-000000000002', 'Отказ', 'rejected', '#E24B4A', 5, true, false),
  ('b0000000-0000-0000-0000-000000000002', 'Конвертирован', 'converted', '#639922', 6, true, true);

-- DEAL FUNNEL (one for all deals)
INSERT INTO public.funnels (id, name, type, is_default) VALUES
  ('d0000000-0000-0000-0000-000000000003', 'Основная воронка сделок', 'deal', true);

INSERT INTO public.funnel_stages (funnel_id, name, slug, color, sort_order, is_final, is_success) VALUES
  ('d0000000-0000-0000-0000-000000000003', 'Квалифицирован', 'qualified', '#378ADD', 1, false, false),
  ('d0000000-0000-0000-0000-000000000003', 'КП отправлено', 'kp_sent', '#1D9E75', 2, false, false),
  ('d0000000-0000-0000-0000-000000000003', 'Работа с возражениями', 'objections', '#EF9F27', 3, false, false),
  ('d0000000-0000-0000-0000-000000000003', 'Просчёт стоимости', 'price_calc', '#7F77DD', 4, false, false),
  ('d0000000-0000-0000-0000-000000000003', 'Счёт выставлен', 'invoice', '#1D9E75', 5, false, false),
  ('d0000000-0000-0000-0000-000000000003', 'Выиграна', 'won', '#639922', 6, true, true),
  ('d0000000-0000-0000-0000-000000000003', 'Проиграна', 'lost', '#E24B4A', 7, true, false);

-- ============================================================
-- 6. INSERT AUTOMATIONS
-- ============================================================

-- Helper: get stage ID by funnel and slug
-- Lead Funnel A automations
INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 0, 'Выйти на контакт — {company}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'a0000000-0000-0000-0000-000000000001' AND fs.slug = 'new_contact';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 1, 'Подготовить и отправить КП — {company}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'a0000000-0000-0000-0000-000000000001' AND fs.slug = 'qualification';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 30, 'Реактивация — {company}, последний контакт {date}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'a0000000-0000-0000-0000-000000000001' AND fs.slug = 'sleeping';

-- Lead Funnel B automations
INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 0, 'Выйти на контакт — {company}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'b0000000-0000-0000-0000-000000000002' AND fs.slug = 'new_contact';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 5, 'Позвонить после получения пробников — {company}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'b0000000-0000-0000-0000-000000000002' AND fs.slug = 'probniki';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 1, 'Подготовить и отправить КП — {company}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'b0000000-0000-0000-0000-000000000002' AND fs.slug = 'qualification';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 30, 'Реактивация — {company}, последний контакт {date}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'b0000000-0000-0000-0000-000000000002' AND fs.slug = 'sleeping';

-- Deal funnel automations
-- qualified
INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 1, 'Отправить КП — {company}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'qualified';

-- kp_sent
INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 3, 'Follow-up по КП — {company}: уточни получил ли, есть ли вопросы', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'kp_sent';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 7, 'Follow-up #2 — {company}', 'manager', false, null, 'ручная'
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'kp_sent';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 14, 'Последний follow-up — {company}', 'manager', false, null, 'ручная'
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'kp_sent';

-- objections
INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 0, 'Записать возражения в карточку сделки — {company}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'objections';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 1, 'Обсудить возражения с руководителем отдела — {company}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'objections';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 3, 'Follow-up с преимуществами продукта — {company}', 'manager', true, 3, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'objections';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 7, 'Follow-up #2 — {company}', 'manager', false, null, 'ручная'
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'objections';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 14, 'Финальный follow-up — {company}. Если нет ответа -> Проиграна', 'manager', false, null, 'ручная'
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'objections';

-- price_calc
INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 0, 'Просчитать стоимость — {company}', 'worker', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'price_calc';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'daily_until_changed', 1, 'Напоминание: просчёт стоимости — {company}', 'worker', true, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'price_calc';

-- invoice
INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 1, 'Проверить оплату счёта — {company}', 'worker', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'invoice';

-- won
INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 0, 'Передать заказ в производство — {company}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'won';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 5, 'Написать клиенту после получения — {company}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'won';

INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 30, 'Напомнить о пополнении — {company}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'won';

-- lost
INSERT INTO public.stage_automations (stage_id, trigger, delay_days, task_title_template, assignee_role, is_repeating, max_repeats, notes)
SELECT fs.id, 'on_enter', 0, 'Зафиксировать причину отказа в карточке — {company}', 'manager', false, null, null
FROM public.funnel_stages fs WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003' AND fs.slug = 'lost';

-- ============================================================
-- 7. MIGRATE EXISTING LEADS TO DEFAULT FUNNEL A
-- ============================================================

-- Set funnel_id for existing leads to default Funnel A
UPDATE public.leads SET funnel_id = 'a0000000-0000-0000-0000-000000000001' WHERE funnel_id IS NULL;

-- Map existing lead status to new stage_id
UPDATE public.leads l SET stage_id = fs.id
FROM public.funnel_stages fs
WHERE fs.funnel_id = 'a0000000-0000-0000-0000-000000000001'
  AND l.funnel_id = 'a0000000-0000-0000-0000-000000000001'
  AND l.stage_id IS NULL
  AND (
    (l.status::text IN ('new', 'callback') AND fs.slug = 'new_contact')
    OR (l.status::text IN ('in_progress', 'samples', 'samples_shipped', 'invoice') AND fs.slug = 'qualification')
    OR (l.status::text = 'rejected' AND fs.slug = 'rejected')
    OR (l.status::text = 'converted' AND fs.slug = 'converted')
  );

-- Fallback: any unmapped leads go to first stage
UPDATE public.leads l SET stage_id = (
  SELECT fs.id FROM public.funnel_stages fs
  WHERE fs.funnel_id = l.funnel_id AND fs.sort_order = 1
  LIMIT 1
) WHERE l.stage_id IS NULL AND l.funnel_id IS NOT NULL;

-- ============================================================
-- 8. MIGRATE EXISTING DEALS TO DEFAULT DEAL FUNNEL
-- ============================================================

UPDATE public.deals SET funnel_id = 'd0000000-0000-0000-0000-000000000003' WHERE funnel_id IS NULL;

-- Map existing deal stage to new stage_id
UPDATE public.deals d SET stage_id = fs.id
FROM public.funnel_stages fs
WHERE fs.funnel_id = 'd0000000-0000-0000-0000-000000000003'
  AND d.funnel_id = 'd0000000-0000-0000-0000-000000000003'
  AND d.stage_id IS NULL
  AND (
    (d.stage::text IN ('lead', 'proposal') AND fs.slug = 'qualified')
    OR (d.stage::text = 'negotiation' AND fs.slug = 'objections')
    OR (d.stage::text = 'order_assembly' AND fs.slug = 'price_calc')
    OR (d.stage::text = 'won' AND fs.slug = 'won')
    OR (d.stage::text = 'lost' AND fs.slug = 'lost')
  );

-- Fallback
UPDATE public.deals d SET stage_id = (
  SELECT fs.id FROM public.funnel_stages fs
  WHERE fs.funnel_id = d.funnel_id AND fs.sort_order = 1
  LIMIT 1
) WHERE d.stage_id IS NULL AND d.funnel_id IS NOT NULL;

COMMIT;
