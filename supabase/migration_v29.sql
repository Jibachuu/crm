-- Migration v29: File templates (photo/doc folders for quick insert into chats)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.file_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folder TEXT NOT NULL, -- folder name like "Фото флаконов", "Брошюры"
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT, -- image/pdf/doc
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_templates_folder ON public.file_templates(folder);

ALTER TABLE public.file_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read file_templates" ON public.file_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages file_templates" ON public.file_templates FOR ALL TO authenticated USING (current_user_role() IN ('admin', 'supervisor'));
