-- TEST FIXTURE ONLY. Executed in an in-memory PGlite database, never Supabase.
-- Source tables contain only columns used by the tested functions. Ledger column types,
-- identities, checks and foreign keys mirror read-only metadata collected 2026-10-16.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.workspaces(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES auth.users(id),name text NOT NULL,legal_name text,cnpj text);
CREATE TABLE public.workspace_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),user_id uuid NOT NULL REFERENCES auth.users(id),role text NOT NULL DEFAULT 'member',role_type text,access_expires_at timestamptz,UNIQUE(workspace_id,user_id));
CREATE TABLE public.leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),name text NOT NULL,email text,phone text,status text NOT NULL DEFAULT 'active',source text,value numeric(18,2),merged_into_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),custom_data jsonb NOT NULL DEFAULT '{}');
CREATE TABLE public.products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),name text NOT NULL,sku text,description text,price numeric(18,2) NOT NULL DEFAULT 0,stock integer NOT NULL DEFAULT 0,active boolean NOT NULL DEFAULT true);
CREATE TABLE public.lead_products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),lead_id uuid NOT NULL REFERENCES public.leads(id),product_id uuid NOT NULL REFERENCES public.products(id),quantity numeric(12,3) NOT NULL DEFAULT 1,unit_price numeric,kind text NOT NULL DEFAULT 'comprou',sold_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.slim_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),request_id uuid NOT NULL,request_payload jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),customer_id uuid NOT NULL REFERENCES public.leads(id),order_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
 subtotal_cents bigint NOT NULL CHECK(subtotal_cents BETWEEN 0 AND 99999999999999),discount_cents bigint NOT NULL CHECK(discount_cents>=0),total_cents bigint NOT NULL CHECK(total_cents>=0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),cancelled_at timestamptz,cancelled_by uuid REFERENCES auth.users(id),cancellation_reason text,
 UNIQUE(workspace_id,request_id),UNIQUE(id,workspace_id),CHECK(subtotal_cents-discount_cents=total_cents),
 CHECK((status='confirmed' AND cancelled_at IS NULL AND cancellation_reason IS NULL) OR (status='cancelled' AND cancelled_at IS NOT NULL AND length(btrim(cancellation_reason)) BETWEEN 1 AND 500))
);
CREATE TABLE public.slim_stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,order_id uuid NOT NULL,product_id uuid NOT NULL REFERENCES public.products(id),
 kind text NOT NULL CHECK(kind IN ('sale','reversal')),quantity integer NOT NULL CHECK(quantity>0),balance_after integer NOT NULL CHECK(balance_after>=0),actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(order_id,product_id,kind),FOREIGN KEY(order_id,workspace_id) REFERENCES public.slim_orders(id,workspace_id)
);
GRANT USAGE ON SCHEMA public,auth,private,extensions TO authenticated,service_role,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role,anon;
-- Access policies are installed by the test after loading the actual workspace helper.
