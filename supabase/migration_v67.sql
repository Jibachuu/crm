-- Migration v67: Soft delete + audit log
-- Replaces hard DELETE with deleted_at marker for leads/deals/contacts/companies/tasks.
-- Admin can restore from /trash within retention window.
-- Run in Supabase SQL Editor.

-- 1. Add deleted_at columns
ALTER TABLE public.leads     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.deals     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.contacts  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.tasks     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Partial indexes for "active rows" filter (most queries)
CREATE INDEX IF NOT EXISTS idx_leads_active     ON public.leads(id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deals_active     ON public.deals(id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_active  ON public.contacts(id)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_companies_active ON public.companies(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_active     ON public.tasks(id)     WHERE deleted_at IS NULL;

-- 3. Update SELECT RLS policies to hide soft-deleted from non-admins
-- Admins still see everything (so they can restore from /trash without
-- bypassing RLS via service role).

DROP POLICY IF EXISTS "Authenticated users can read companies" ON public.companies;
CREATE POLICY "Read non-deleted companies" ON public.companies
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR current_user_role() = 'admin');

DROP POLICY IF EXISTS "Authenticated users can read contacts" ON public.contacts;
CREATE POLICY "Read non-deleted contacts" ON public.contacts
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR current_user_role() = 'admin');

DROP POLICY IF EXISTS "Managers see own leads, supervisors/admin see all" ON public.leads;
CREATE POLICY "Read non-deleted leads" ON public.leads
  FOR SELECT TO authenticated
  USING (
    (deleted_at IS NULL OR current_user_role() = 'admin')
    AND (
      current_user_role() IN ('admin', 'supervisor')
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Managers see own deals, supervisors/admin see all" ON public.deals;
CREATE POLICY "Read non-deleted deals" ON public.deals
  FOR SELECT TO authenticated
  USING (
    (deleted_at IS NULL OR current_user_role() = 'admin')
    AND (
      current_user_role() IN ('admin', 'supervisor')
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users see own tasks, supervisors/admin see all" ON public.tasks;
CREATE POLICY "Read non-deleted tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    (deleted_at IS NULL OR current_user_role() = 'admin')
    AND (
      current_user_role() IN ('admin', 'supervisor')
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
    )
  );

-- 4. Audit log — every soft-delete, restore, hard-delete recorded with actor
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('delete', 'restore', 'hard_delete')),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_row ON public.audit_log(table_name, row_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created   ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action    ON public.audit_log(action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audit log readable by admin/supervisor" ON public.audit_log
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'supervisor'));

-- Inserts only via service role (admin client in API routes); no INSERT policy.
