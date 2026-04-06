-- ============================================================
-- CRM Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'supervisor');
CREATE TYPE lead_status AS ENUM ('new', 'in_progress', 'qualified', 'unqualified', 'converted');
CREATE TYPE deal_stage AS ENUM ('lead', 'proposal', 'negotiation', 'won', 'lost');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'done', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE custom_field_type AS ENUM ('text', 'number', 'date', 'boolean', 'select');
CREATE TYPE communication_channel AS ENUM ('email', 'telegram', 'phone', 'maks', 'note');
CREATE TYPE entity_type AS ENUM ('lead', 'deal', 'contact', 'company');
CREATE TYPE comm_direction AS ENUM ('inbound', 'outbound');

-- ============================================================
-- USERS (extends auth.users)
-- ============================================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'manager',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PERMISSIONS (per-user resource overrides)
-- ============================================================
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT true,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_update BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource)
);

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  inn TEXT,
  legal_address TEXT,
  actual_address TEXT,
  company_type TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  assigned_to UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  email TEXT,
  telegram_id TEXT,
  maks_id TEXT,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  assigned_to UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  source TEXT,
  status lead_status NOT NULL DEFAULT 'new',
  description TEXT,
  assigned_to UUID REFERENCES public.users(id),
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- DEALS
-- ============================================================
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  source TEXT,
  stage deal_stage NOT NULL DEFAULT 'lead',
  amount NUMERIC(15, 2),
  description TEXT,
  assigned_to UUID REFERENCES public.users(id),
  created_by UUID NOT NULL REFERENCES public.users(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  base_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.product_attributes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  values TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  attributes JSONB NOT NULL DEFAULT '{}',
  price NUMERIC(15, 2),
  stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- LEAD & DEAL PRODUCTS
-- ============================================================
CREATE TABLE public.lead_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  variant_id UUID REFERENCES public.product_variants(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(15, 2) NOT NULL,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  total_price NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.deal_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  variant_id UUID REFERENCES public.product_variants(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(15, 2) NOT NULL,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  total_price NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- COMMUNICATIONS
-- ============================================================
CREATE TABLE public.communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  channel communication_channel NOT NULL,
  direction comm_direction NOT NULL DEFAULT 'outbound',
  subject TEXT,
  body TEXT,
  from_address TEXT,
  to_address TEXT,
  duration_seconds INTEGER,
  recording_url TEXT,
  transcript TEXT,
  external_id TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast entity lookup
CREATE INDEX idx_communications_entity ON public.communications (entity_type, entity_id);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'pending',
  priority task_priority NOT NULL DEFAULT 'medium',
  entity_type entity_type,
  entity_id UUID,
  assigned_to UUID REFERENCES public.users(id),
  created_by UUID NOT NULL REFERENCES public.users(id),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_entity ON public.tasks (entity_type, entity_id);
CREATE INDEX idx_tasks_assigned ON public.tasks (assigned_to);

-- ============================================================
-- CUSTOM FIELDS
-- ============================================================
CREATE TABLE public.custom_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type entity_type NOT NULL,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type custom_field_type NOT NULL DEFAULT 'text',
  options TEXT[],
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, name)
);

CREATE TABLE public.custom_field_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  value_text TEXT,
  value_number NUMERIC,
  value_date DATE,
  value_boolean BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (field_id, entity_id)
);

CREATE INDEX idx_cfv_entity ON public.custom_field_values (entity_type, entity_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cfv_updated_at BEFORE UPDATE ON public.custom_field_values FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AUTO-CREATE USER ON AUTH SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'manager'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- USERS ----
CREATE POLICY "Users can view all users" ON public.users
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "Admin can manage users" ON public.users
  FOR ALL TO authenticated USING (current_user_role() = 'admin');

-- ---- PERMISSIONS ----
CREATE POLICY "Admin manages permissions" ON public.permissions
  FOR ALL TO authenticated USING (current_user_role() = 'admin');

CREATE POLICY "User views own permissions" ON public.permissions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---- COMPANIES ----
CREATE POLICY "Authenticated users can read companies" ON public.companies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create companies" ON public.companies
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admin and supervisor can update companies" ON public.companies
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin', 'supervisor') OR created_by = auth.uid() OR assigned_to = auth.uid());

CREATE POLICY "Admin can delete companies" ON public.companies
  FOR DELETE TO authenticated USING (current_user_role() = 'admin');

-- ---- CONTACTS ----
CREATE POLICY "Authenticated users can read contacts" ON public.contacts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create contacts" ON public.contacts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Can update own or assigned contacts" ON public.contacts
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin', 'supervisor') OR created_by = auth.uid() OR assigned_to = auth.uid());

CREATE POLICY "Admin can delete contacts" ON public.contacts
  FOR DELETE TO authenticated USING (current_user_role() = 'admin');

-- ---- LEADS ----
CREATE POLICY "Managers see own leads, supervisors/admin see all" ON public.leads
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('admin', 'supervisor')
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Authenticated users can create leads" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Can update own or assigned leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (
    current_user_role() IN ('admin', 'supervisor')
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Admin can delete leads" ON public.leads
  FOR DELETE TO authenticated USING (current_user_role() = 'admin');

-- ---- DEALS ----
CREATE POLICY "Managers see own deals, supervisors/admin see all" ON public.deals
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('admin', 'supervisor')
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Authenticated users can create deals" ON public.deals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Can update own or assigned deals" ON public.deals
  FOR UPDATE TO authenticated
  USING (
    current_user_role() IN ('admin', 'supervisor')
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Admin can delete deals" ON public.deals
  FOR DELETE TO authenticated USING (current_user_role() = 'admin');

-- ---- PRODUCTS ----
CREATE POLICY "All authenticated can read products" ON public.products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manages products" ON public.products
  FOR ALL TO authenticated USING (current_user_role() = 'admin');

CREATE POLICY "All authenticated can read product_attributes" ON public.product_attributes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manages product_attributes" ON public.product_attributes
  FOR ALL TO authenticated USING (current_user_role() = 'admin');

CREATE POLICY "All authenticated can read product_variants" ON public.product_variants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manages product_variants" ON public.product_variants
  FOR ALL TO authenticated USING (current_user_role() = 'admin');

-- ---- LEAD/DEAL PRODUCTS ----
CREATE POLICY "Can read lead_products if can read lead" ON public.lead_products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Can manage lead_products" ON public.lead_products
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Can read deal_products" ON public.deal_products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Can manage deal_products" ON public.deal_products
  FOR ALL TO authenticated USING (true);

-- ---- COMMUNICATIONS ----
CREATE POLICY "Can read communications" ON public.communications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Can create communications" ON public.communications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admin can delete communications" ON public.communications
  FOR DELETE TO authenticated USING (current_user_role() = 'admin');

-- ---- TASKS ----
CREATE POLICY "Users see own tasks, supervisors/admin see all" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('admin', 'supervisor')
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Authenticated users can create tasks" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Can update own or assigned tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    current_user_role() IN ('admin', 'supervisor')
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Admin can delete tasks" ON public.tasks
  FOR DELETE TO authenticated USING (current_user_role() = 'admin');

-- ---- CUSTOM FIELDS ----
CREATE POLICY "All authenticated can read custom_fields" ON public.custom_fields
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manages custom_fields" ON public.custom_fields
  FOR ALL TO authenticated USING (current_user_role() = 'admin');

CREATE POLICY "All authenticated can read custom_field_values" ON public.custom_field_values
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Can manage custom_field_values" ON public.custom_field_values
  FOR ALL TO authenticated USING (true);

-- ============================================================
-- SEED: Default lead sources
-- ============================================================
-- You can add seed data here if needed
