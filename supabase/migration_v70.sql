-- Migration v70: configurable auto-task automations
-- Replaces hardcoded "+3 days after delivery" / "ship tracking task" /
-- "new production assignment" tasks in /api/production with rows that
-- admin can enable/disable and re-time from /settings.
--
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.task_automation_settings (
  id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  days_offset INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'medium',
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.task_automation_settings (id, enabled, days_offset, priority, description) VALUES
  ('production.assigned',  true, 0, 'high',
   'Новый заказ передан в работу — задача исполнителю.'),
  ('production.shipped',   true, 0, 'high',
   'Заказ отгружен с трек-номером — задача менеджеру передать клиенту.'),
  ('production.delivered_review', true, 3, 'medium',
   'Через N дней после доставки запросить отзыв (только для won-сделок).')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.task_automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All read automation settings"
  ON public.task_automation_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin updates automation settings"
  ON public.task_automation_settings
  FOR UPDATE TO authenticated USING (current_user_role() = 'admin');
