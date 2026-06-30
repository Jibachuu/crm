-- v91 (2026-06-30): убрать «Другое» из venue_types по просьбе менеджера.
-- Компаниям, у которых venue_type_id указывал на «Другое», ставим NULL —
-- пусть лучше будет пусто, чем мусорный «Другое».

UPDATE companies
   SET venue_type_id = NULL
 WHERE venue_type_id IN (SELECT id FROM venue_types WHERE name = 'Другое');

DELETE FROM venue_types WHERE name = 'Другое';
