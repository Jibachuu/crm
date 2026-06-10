-- v86: банковские реквизиты в карточке компании.
-- До сих пор bank_name / р-с / БИК / к/с менеджер вводил руками каждый раз
-- при создании договора или счёта — данные оседали в contracts.buyer_*
-- но обратно в companies не возвращались, так что следующий документ той
-- же компании снова требовал ручного ввода.
-- Эти колонки становятся источником истины: UI карточки компании их
-- редактирует, формы создания договора/счёта подтягивают defaults, а после
-- сохранения документа любые правки бан-реквизитов прокидываются обратно
-- в companies, чтобы накапливать актуальные данные.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS bik TEXT,
  ADD COLUMN IF NOT EXISTS corr_account TEXT;
