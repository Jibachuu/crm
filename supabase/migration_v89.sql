-- v89: позиции из заказов Тильды без привязки к каталогу должны попадать
-- в deal_products / lead_products как «свободные» строки. Раньше:
-- product_id был NOT NULL и без колонки name — webhook /api/webhooks/tilda
-- молча skip'ал такие позиции (см. фильтр `.filter(r => r.productId)`),
-- они оседали только в текстовом описании ЗАКАЗа. Менеджер открывал
-- сделку → вкладка «Товары (0)» → ничего, хотя в описании 2 позиции
-- по 3500₽. Жиба 19.06.2026: «надо чтобы добавлялся».
--
-- Решение:
-- 1) Колонка name TEXT — хранит имя из источника (когда product_id null
--    или когда хотим перебить отображаемое имя).
-- 2) product_id становится NULLABLE — теперь можно вставить позицию без
--    привязки к каталогу.
-- 3) FK product_id уже ссылается на products(id) с дефолтным ON DELETE
--    RESTRICT — оставляем как есть, NULL валиден.

ALTER TABLE public.lead_products ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.deal_products ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE public.lead_products ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.deal_products ALTER COLUMN product_id DROP NOT NULL;
