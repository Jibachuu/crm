-- SIP credentials for WebRTC phone
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sip_login TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sip_password TEXT;
