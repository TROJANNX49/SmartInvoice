/*
# SmartInvoice AI — Initial Schema

## Summary
Creates the core tables for SmartInvoice AI. Uses Supabase Auth for identity;
all user-owned rows are scoped via `auth.uid()`.

## New Tables

### profiles
Extends `auth.users` with display name, company info, billing tier, and credit balance.
- `id` (uuid, PK, FK → auth.users)
- `full_name` (text)
- `company_name` (text)
- `subscription_tier` (text, default 'free')
- `credits` (int, default 3)
- `stripe_customer_id` (text, nullable)
- `stripe_subscription_id` (text, nullable)
- `created_at`, `updated_at` (timestamptz)

### invoices
Stores invoice and estimate documents owned by a user.
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users, DEFAULT auth.uid())
- `invoice_number` (text, not null)
- `type` ('invoice' | 'estimate')
- `status` ('draft' | 'sent' | 'paid' | 'overdue' | 'cancelled', default 'draft')
- `client_name`, `client_email`, `client_address` (text)
- `items` (jsonb, default '[]')
- `subtotal`, `tax_rate`, `tax_amount`, `total` (numeric)
- `currency` (text, default 'USD')
- `notes`, `terms`, `due_date`, `issued_date`, `raw_notes`

### invoice_templates
Custom invoice branding templates owned by a user.
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users, DEFAULT auth.uid())
- `name` (text, not null)
- `is_default` (boolean, default false)
- `template_config` (jsonb, default '{}')

## Security
- RLS enabled on all tables.
- All policies scoped `TO authenticated` — app requires sign-in.
- Each user can only read/write/delete their own rows.
- `user_id` defaults to `auth.uid()` so inserts without explicit user_id still pass RLS.
*/

-- ─── profiles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  company_name text,
  subscription_tier text NOT NULL DEFAULT 'free',
  credits integer NOT NULL DEFAULT 3,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─── invoices ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  type text NOT NULL DEFAULT 'invoice' CHECK (type IN ('invoice','estimate')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  client_name text NOT NULL DEFAULT '',
  client_email text,
  client_address text,
  items jsonb NOT NULL DEFAULT '[]',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  terms text,
  due_date date,
  issued_date date NOT NULL DEFAULT CURRENT_DATE,
  raw_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_invoices" ON invoices;
CREATE POLICY "select_own_invoices" ON invoices FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_invoices" ON invoices;
CREATE POLICY "insert_own_invoices" ON invoices FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_invoices" ON invoices;
CREATE POLICY "update_own_invoices" ON invoices FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_invoices" ON invoices;
CREATE POLICY "delete_own_invoices" ON invoices FOR DELETE
  TO authenticated USING (auth.uid() = user_id);


-- ─── invoice_templates ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  template_config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_user_id ON invoice_templates(user_id);

ALTER TABLE invoice_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_templates" ON invoice_templates;
CREATE POLICY "select_own_templates" ON invoice_templates FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_templates" ON invoice_templates;
CREATE POLICY "insert_own_templates" ON invoice_templates FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_templates" ON invoice_templates;
CREATE POLICY "update_own_templates" ON invoice_templates FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_templates" ON invoice_templates;
CREATE POLICY "delete_own_templates" ON invoice_templates FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
