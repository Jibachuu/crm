-- Add transcript field for Whisper transcription of call recordings
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS transcript TEXT;
