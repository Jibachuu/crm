-- Fix v29: Add INSERT policy for file_templates
-- Run in Supabase SQL Editor

DROP POLICY IF EXISTS "Admin manages file_templates" ON public.file_templates;
CREATE POLICY "Admin insert file_templates" ON public.file_templates FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin', 'supervisor'));
CREATE POLICY "Admin update file_templates" ON public.file_templates FOR UPDATE TO authenticated USING (current_user_role() IN ('admin', 'supervisor'));
CREATE POLICY "Admin delete file_templates" ON public.file_templates FOR DELETE TO authenticated USING (current_user_role() IN ('admin', 'supervisor'));
