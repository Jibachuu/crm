-- ============================================================
-- V57: multi-channel messengers (VK, Avito, WhatsApp)
-- ============================================================

-- Expand communication_channel enum
ALTER TYPE communication_channel ADD VALUE IF NOT EXISTS 'whatsapp';
ALTER TYPE communication_channel ADD VALUE IF NOT EXISTS 'avito';
ALTER TYPE communication_channel ADD VALUE IF NOT EXISTS 'vk';

-- Add per-channel identifiers to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS avito_profile_id TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS vk_id TEXT;

-- Inbox messages table for VK/Avito/WhatsApp (unified storage)
-- Telegram + MAX still use communications + their proxy caches.
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel TEXT NOT NULL,            -- 'vk' | 'avito' | 'whatsapp'
  chat_id TEXT NOT NULL,            -- external peer/user id (VK user_id, WA phone, Avito chat_id)
  external_id TEXT,                 -- provider message id (for dedup)
  direction TEXT NOT NULL DEFAULT 'inbound',  -- 'inbound' | 'outbound'
  sender_name TEXT,
  text TEXT,
  attachments JSONB,                -- raw attachment payload from provider
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_channel_chat ON public.inbox_messages (channel, chat_id, sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_inbox_messages_external ON public.inbox_messages (channel, external_id) WHERE external_id IS NOT NULL;

-- RLS
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inbox_messages_all_authenticated" ON public.inbox_messages;
CREATE POLICY "inbox_messages_all_authenticated" ON public.inbox_messages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
