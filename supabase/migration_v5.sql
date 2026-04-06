-- Migration v5: Placeholder users (imported from files, not yet registered)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN NOT NULL DEFAULT false;
