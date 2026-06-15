-- v88: soft delete для invoices. Закрывает старую дыру: счёт удалялся
-- физически (admin.from('invoices').delete()), восстановить было нельзя.
-- 2026-06-15: Жиба случайно удалила счёт №60 — не восстановили (только
-- через backup Supabase Dashboard).
--
-- Теперь delete = пометка deleted_at, счёт исчезает из списков, лежит
-- в /trash 30 дней, доступен admin/supervisor для восстановления через
-- кнопку «Восстановить» или для безвозвратного удаления.
--
-- На таблицу invoices RLS не включена (управление через admin client в
-- API роутах), поэтому SELECT-политики не правим — фильтр deleted_at
-- IS NULL делается в /api/invoices GET.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_active
  ON public.invoices(id) WHERE deleted_at IS NULL;
