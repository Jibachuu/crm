-- Migration v69: persist notification read state on the server
-- Replaces localStorage("read_notifications" / "beeped_notifications")
-- so that clearing browser data doesn't resurrect old notifications.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.user_notification_reads (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_user_notification_reads_user
  ON public.user_notification_reads(user_id, read_at DESC);

ALTER TABLE public.user_notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User reads own notification flags"
  ON public.user_notification_reads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Inserts/upserts go through the API (service role).
-- No INSERT/UPDATE policy needed for end users.
