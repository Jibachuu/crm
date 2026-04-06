-- Migration v15: Group chats
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.group_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id),
  body TEXT,
  file_url TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group ON public.group_messages(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_chat_members(user_id);

-- Track last read message per user per group
CREATE TABLE IF NOT EXISTS public.group_chat_reads (
  group_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can access group chats" ON public.group_chats FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Members can access memberships" ON public.group_chat_members FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Members can access messages" ON public.group_messages FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Members can access reads" ON public.group_chat_reads FOR ALL USING (auth.uid() IS NOT NULL);
