-- v87: is_approved-флаг в users + RLS-gating на справочниках companies /
-- contacts / products. До этого любой authenticated юзер (даже только что
-- зарегистрировавшийся посторонний) видел весь каталог товаров с ценами,
-- все контакты и компании — это была критическая утечка.
--
-- Phase 1 (commit dae7a0c) закрыл UI-регистрацию и пере-навёл leads/deals
-- SSR на user-client с RLS. Эта миграция закрывает оставшиеся каналы и
-- даёт админу управляемый flow «утверждения» новых аккаунтов.
--
-- Существующие пользователи (Жиба + менеджеры) автоматически получают
-- is_approved=true. Новые — false, пока админ не подтвердит.

-- 1. Колонка с дефолтом false для будущих, потом grandfather всех текущих.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

UPDATE public.users SET is_approved = true WHERE is_approved = false;

-- 2. Триггер handle_new_user (даже если signUp на Supabase Dashboard
-- отключён, защитимся в коде): новые юзеры всегда не утверждены.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'manager',
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Helper для RLS: true если текущий пользователь утверждён.
-- SECURITY DEFINER чтобы обойти RLS на самой users-таблице (иначе
-- была бы рекурсия).
CREATE OR REPLACE FUNCTION public.current_user_approved()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_approved FROM public.users WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4. Переписываем read-политики на shared-таблицах. Раньше — «все
-- authenticated». Теперь — «только approved».

DROP POLICY IF EXISTS "Authenticated users can read companies" ON public.companies;
CREATE POLICY "Approved users can read companies" ON public.companies
  FOR SELECT TO authenticated
  USING (current_user_approved());

DROP POLICY IF EXISTS "Authenticated users can read contacts" ON public.contacts;
CREATE POLICY "Approved users can read contacts" ON public.contacts
  FOR SELECT TO authenticated
  USING (current_user_approved());

DROP POLICY IF EXISTS "All authenticated can read products" ON public.products;
CREATE POLICY "Approved users can read products" ON public.products
  FOR SELECT TO authenticated
  USING (current_user_approved());

DROP POLICY IF EXISTS "All authenticated can read product_attributes" ON public.product_attributes;
CREATE POLICY "Approved users can read product_attributes" ON public.product_attributes
  FOR SELECT TO authenticated
  USING (current_user_approved());

DROP POLICY IF EXISTS "All authenticated can read product_variants" ON public.product_variants;
CREATE POLICY "Approved users can read product_variants" ON public.product_variants
  FOR SELECT TO authenticated
  USING (current_user_approved());

-- 5. INSERT-политики тоже подтянем — чтобы неутверждённый не мог
-- хоть что-то создать (создание контакта от чужого имени — тоже утечка
-- через JOIN на companies, плюс мусор в базе).
DROP POLICY IF EXISTS "Authenticated users can create companies" ON public.companies;
CREATE POLICY "Approved users can create companies" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (current_user_approved());

DROP POLICY IF EXISTS "Authenticated users can create contacts" ON public.contacts;
CREATE POLICY "Approved users can create contacts" ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (current_user_approved());

DROP POLICY IF EXISTS "Authenticated users can create leads" ON public.leads;
CREATE POLICY "Approved users can create leads" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (current_user_approved());

DROP POLICY IF EXISTS "Authenticated users can create deals" ON public.deals;
CREATE POLICY "Approved users can create deals" ON public.deals
  FOR INSERT TO authenticated
  WITH CHECK (current_user_approved());
