CREATE TYPE IF NOT EXISTS public.app_role AS ENUM ('admin', 'user');

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role); $$;

CREATE POLICY IF NOT EXISTS "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  city text NOT NULL,
  address text,
  description text,
  price numeric(12,2),
  subsidy_estimate numeric(12,2),
  monthly_parcel numeric(12,2),
  down_payment numeric(12,2),
  show_parcel boolean NOT NULL DEFAULT true,
  show_down_payment boolean NOT NULL DEFAULT false,
  bedrooms int DEFAULT 2,
  bathrooms int DEFAULT 1,
  area_m2 numeric(8,2),
  tag text,
  images text[] DEFAULT '{}'::text[],
  pdfs text[] DEFAULT '{}'::text[],
  plans jsonb DEFAULT '[]'::jsonb,
  construction_status text NOT NULL DEFAULT 'pronto',
  launch_date date,
  published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Anyone can view published properties" ON public.properties FOR SELECT USING (published = true OR public.has_role((select auth.uid()), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins can insert properties" ON public.properties FOR INSERT TO authenticated WITH CHECK (public.has_role((select auth.uid()), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins can update properties" ON public.properties FOR UPDATE TO authenticated USING (public.has_role((select auth.uid()), 'admin')) WITH CHECK (public.has_role((select auth.uid()), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins can delete properties" ON public.properties FOR DELETE TO authenticated USING (public.has_role((select auth.uid()), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS properties_set_updated_at ON public.properties;
CREATE TRIGGER properties_set_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
