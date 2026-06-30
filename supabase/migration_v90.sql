-- v90 (2026-06-30): merge companies.company_type → venue_type_id.
-- Менеджер: "вид компании" и "тип заведения" дублируют друг друга,
-- оставляем только venue_type_id. Заодно убираем из справочника
-- venue_types три неактуальных значения — Спа, Коворкинг, Бизнес-центр.
--
-- company_type-колонку НЕ дропаем (есть исторические данные + код,
-- который её читает в /my-clients/cold-calls). Просто перестаём
-- писать туда новые значения и не показываем в формах.

-- 1) Перенос исторических значений company_type → venue_type_id для
--    тех записей, где venue_type_id ещё не выставлен.
DO $$
DECLARE
  v_restaurant UUID;
  v_hotel      UUID;
  v_salon      UUID;
  v_other      UUID;
BEGIN
  SELECT id INTO v_restaurant FROM venue_types WHERE name = 'Ресторан'      LIMIT 1;
  SELECT id INTO v_hotel      FROM venue_types WHERE name = 'Отель'         LIMIT 1;
  SELECT id INTO v_salon      FROM venue_types WHERE name = 'Салон красоты' LIMIT 1;
  SELECT id INTO v_other      FROM venue_types WHERE name = 'Другое'        LIMIT 1;

  -- restaurant → Ресторан
  IF v_restaurant IS NOT NULL THEN
    UPDATE companies SET venue_type_id = v_restaurant
     WHERE company_type = 'restaurant' AND venue_type_id IS NULL;
  END IF;

  -- hotel → Отель
  IF v_hotel IS NOT NULL THEN
    UPDATE companies SET venue_type_id = v_hotel
     WHERE company_type = 'hotel' AND venue_type_id IS NULL;
  END IF;

  -- salon → Салон красоты
  IF v_salon IS NOT NULL THEN
    UPDATE companies SET venue_type_id = v_salon
     WHERE company_type = 'salon' AND venue_type_id IS NULL;
  END IF;

  -- retail / wholesale / other → Другое (сохраняем сам факт типизации,
  -- даже если точного аналога в venue_types нет).
  IF v_other IS NOT NULL THEN
    UPDATE companies SET venue_type_id = v_other
     WHERE company_type IN ('retail', 'wholesale', 'other')
       AND venue_type_id IS NULL;
  END IF;
END $$;

-- 2) Компаниям, у которых venue_type был Спа/Коворкинг/Бизнес-центр,
--    переставляем на «Другое» (иначе FK сорвётся при DELETE ниже).
UPDATE companies
   SET venue_type_id = (SELECT id FROM venue_types WHERE name = 'Другое' LIMIT 1)
 WHERE venue_type_id IN (
   SELECT id FROM venue_types WHERE name IN ('Спа', 'Коворкинг', 'Бизнес-центр')
 );

-- 3) Чистим справочник.
DELETE FROM venue_types WHERE name IN ('Спа', 'Коворкинг', 'Бизнес-центр');
