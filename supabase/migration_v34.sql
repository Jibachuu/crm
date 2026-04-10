-- Migration v34: Round-robin auto-lead assignment
-- Lets admin pick which users participate in auto-lead distribution.
-- Picker uses last_auto_lead_at ascending to assign each new lead to least-recently-assigned user.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auto_lead_assignee BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_auto_lead_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_auto_lead_assignee ON public.users(auto_lead_assignee) WHERE auto_lead_assignee = true;
