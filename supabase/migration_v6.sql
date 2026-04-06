-- Migration v6: Internal messenger + Email campaigns
-- Run in Supabase SQL Editor

-- ============================================================
-- INTERNAL MESSAGES (team chat)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.internal_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT,
  file_url TEXT,
  file_name TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_messages_pair ON public.internal_messages (
  LEAST(from_user, to_user), GREATEST(from_user, to_user), created_at
);

ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own messages" ON public.internal_messages
  FOR SELECT TO authenticated
  USING (from_user = auth.uid() OR to_user = auth.uid());

CREATE POLICY "Users can send messages" ON public.internal_messages
  FOR INSERT TO authenticated
  WITH CHECK (from_user = auth.uid());

CREATE POLICY "Users can mark own messages read" ON public.internal_messages
  FOR UPDATE TO authenticated
  USING (to_user = auth.uid());

-- ============================================================
-- EMAIL CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_template TEXT NOT NULL,
  from_name TEXT,
  from_email TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, sending, sent, failed
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.email_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_recipients_campaign ON public.email_recipients (campaign_id);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read campaigns" ON public.email_campaigns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage campaigns" ON public.email_campaigns
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated can read recipients" ON public.email_recipients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage recipients" ON public.email_recipients
  FOR ALL TO authenticated USING (true);
