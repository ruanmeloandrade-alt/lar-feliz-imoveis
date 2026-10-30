-- Saude Slim core baseline.
-- This replaces the unsafe inherited migration batch with the minimum
-- operational schema needed by auth/workspaces, CRM, products and suppliers.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'app_role') then
    create type public.app_role as enum ('super_admin', 'user');
  end if;
end $$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  site_url text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  feature_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  full_name text,
  avatar_url text,
  current_workspace_id uuid references public.workspaces(id) on delete set null,
  timezone text not null default 'America/Sao_Paulo',
  notification_prefs jsonb not null default '{}'::jsonb,
  whatsapp_primary text,
  whatsapp_secondary text,
  phone_alt text,
  preferred_contact text,
  job_title text,
  role_in_company text,
  company_name text,
  company_size text,
  niche text,
  city text,
  state text,
  country text,
  website_url text,
  instagram_handle text,
  linkedin_url text,
  acquisition_source text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

create or replace function public.is_workspace_member(_workspace_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = _workspace_id
      and user_id = _user_id
  );
$$;

create or replace function public.generate_workspace_slug(_base text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_clean text;
  candidate text;
  n integer := 0;
begin
  base_clean := regexp_replace(lower(coalesce(_base, 'saude-slim')), '[^a-z0-9]+', '-', 'g');
  base_clean := trim(both '-' from base_clean);
  if base_clean = '' then base_clean := 'saude-slim'; end if;
  candidate := base_clean;

  while exists (select 1 from public.workspaces where slug = candidate) loop
    n := n + 1;
    candidate := base_clean || '-' || n::text;
  end loop;

  return candidate;
end;
$$;

create table if not exists public.crm_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'manual',
  display_name text not null,
  external_account_id text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_account_id)
);

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  crm_source_id uuid references public.crm_sources(id) on delete set null,
  name text not null,
  position integer not null default 0,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  description text,
  position integer not null default 0,
  color text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_source_funnels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  crm_source_id uuid not null references public.crm_sources(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workspace_id, crm_source_id, pipeline_id)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  crm_source_id uuid references public.crm_sources(id) on delete set null,
  name text not null,
  site text,
  notes text,
  phone text,
  cnpj text,
  logo_url text,
  responsible_id uuid references public.profiles(id) on delete set null,
  primary_lead_id uuid,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  crm_source_id uuid references public.crm_sources(id) on delete set null,
  pipeline_id uuid references public.pipelines(id) on delete set null,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  email text,
  phone text,
  phone_normalized text,
  value numeric(14,2) default 0,
  status text not null default 'active',
  conversation_status text not null default 'open',
  responsible_id uuid references public.profiles(id) on delete set null,
  external_id text,
  external_updated_at timestamptz,
  last_message_from text,
  tags jsonb not null default '[]'::jsonb,
  custom_data jsonb not null default '{}'::jsonb,
  source text,
  ai_paused boolean not null default false,
  keep_files boolean not null default false,
  fb_external_id text,
  fb_event_id text,
  fb_fbc text,
  fb_fbp text,
  fb_client_ip text,
  fb_client_ua text,
  messenger_psid text,
  instagram_igsid text,
  merged_into_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.companies
  drop constraint if exists companies_primary_lead_fk;
alter table public.companies
  add constraint companies_primary_lead_fk
  foreign key (primary_lead_id) references public.leads(id) on delete set null;

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists public.product_catalogs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  cover text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  catalog_id uuid not null references public.product_catalogs(id) on delete cascade,
  sku text not null default '',
  name text not null,
  description text not null default '',
  image text not null default '',
  price numeric(14,2) not null default 0,
  promo_price numeric(14,2),
  stock integer not null default 0,
  category text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null default 'interesse',
  quantity numeric(12,2) not null default 1,
  unit_price numeric(14,2),
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lead_id, product_id, kind)
);

create table if not exists public.supplier_product_costs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  supplier_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  cost numeric(12,2) not null default 0,
  min_quantity integer not null default 1,
  lead_time_days integer,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, supplier_id, product_id)
);

create or replace function public.seed_workspace_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_id uuid;
  pipeline_id uuid;
begin
  insert into public.crm_sources (workspace_id, provider, display_name, is_default)
  values (new.id, 'manual', 'Saude Slim', true)
  returning id into source_id;

  insert into public.pipelines (workspace_id, crm_source_id, name, position)
  values (new.id, source_id, 'Vendas', 1)
  returning id into pipeline_id;

  insert into public.crm_source_funnels (workspace_id, crm_source_id, pipeline_id)
  values (new.id, source_id, pipeline_id);

  insert into public.pipeline_stages (workspace_id, pipeline_id, name, position, color)
  values
    (new.id, pipeline_id, 'Novo pedido', 1, '#22c55e'),
    (new.id, pipeline_id, 'Em atendimento', 2, '#84cc16'),
    (new.id, pipeline_id, 'Venda ganha', 3, '#16a34a'),
    (new.id, pipeline_id, 'Venda perdida', 4, '#ef4444');

  insert into public.product_catalogs (workspace_id, name, description)
  values (new.id, 'Catalogo principal', 'Produtos da Saude Slim');

  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  email text;
  display text;
  ws_slug text;
  ws_id uuid;
begin
  email := lower(coalesce(new.email, ''));
  display := coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(email, '@', 1), 'Usuario');
  ws_slug := public.generate_workspace_slug(display);

  insert into public.profiles (id, display_name, full_name)
  values (new.id, display, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  insert into public.workspaces (slug, name, owner_id)
  values (ws_slug, 'Saude Slim', new.id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');

  update public.profiles
  set current_workspace_id = ws_id,
      updated_at = now()
  where id = new.id;

  return new;
end;
$$;

create or replace function public.snapshot_lead_product_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_price numeric(14,2);
begin
  if new.kind = 'comprou' then
    if new.sold_at is null then
      new.sold_at := now();
    end if;

    if new.unit_price is null then
      select coalesce(promo_price, price, 0)
      into product_price
      from public.products
      where id = new.product_id
        and workspace_id = new.workspace_id;

      new.unit_price := coalesce(product_price, 0);
    end if;
  end if;

  return new;
end;
$$;

create index if not exists user_roles_user_idx on public.user_roles (user_id);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);
create index if not exists workspace_members_workspace_idx on public.workspace_members (workspace_id);
create index if not exists crm_sources_workspace_idx on public.crm_sources (workspace_id);
create index if not exists pipelines_workspace_idx on public.pipelines (workspace_id);
create index if not exists pipeline_stages_pipeline_idx on public.pipeline_stages (pipeline_id, position);
create index if not exists crm_source_funnels_workspace_idx on public.crm_source_funnels (workspace_id);
create index if not exists companies_workspace_idx on public.companies (workspace_id);
create index if not exists leads_workspace_idx on public.leads (workspace_id);
create index if not exists leads_pipeline_idx on public.leads (pipeline_id);
create index if not exists leads_stage_idx on public.leads (stage_id);
create unique index if not exists leads_external_uniq on public.leads (crm_source_id, external_id) where external_id is not null;
create index if not exists lead_activities_lead_idx on public.lead_activities (lead_id);
create index if not exists product_catalogs_workspace_idx on public.product_catalogs (workspace_id);
create index if not exists products_workspace_idx on public.products (workspace_id);
create index if not exists products_catalog_idx on public.products (catalog_id);
create index if not exists lead_products_workspace_kind_sold_at_idx on public.lead_products (workspace_id, kind, sold_at desc);
create index if not exists supplier_product_costs_ws_supplier_idx on public.supplier_product_costs (workspace_id, supplier_id);
create index if not exists supplier_product_costs_ws_product_idx on public.supplier_product_costs (workspace_id, product_id);

drop trigger if exists touch_workspaces on public.workspaces;
create trigger touch_workspaces before update on public.workspaces for each row execute function public.touch_updated_at();
drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists trg_crm_sources_updated on public.crm_sources;
create trigger trg_crm_sources_updated before update on public.crm_sources for each row execute function public.touch_updated_at();
drop trigger if exists trg_pipelines_updated on public.pipelines;
create trigger trg_pipelines_updated before update on public.pipelines for each row execute function public.touch_updated_at();
drop trigger if exists trg_pipeline_stages_updated on public.pipeline_stages;
create trigger trg_pipeline_stages_updated before update on public.pipeline_stages for each row execute function public.touch_updated_at();
drop trigger if exists trg_companies_updated on public.companies;
create trigger trg_companies_updated before update on public.companies for each row execute function public.touch_updated_at();
drop trigger if exists trg_leads_updated on public.leads;
create trigger trg_leads_updated before update on public.leads for each row execute function public.touch_updated_at();
drop trigger if exists product_catalogs_touch on public.product_catalogs;
create trigger product_catalogs_touch before update on public.product_catalogs for each row execute function public.touch_updated_at();
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
drop trigger if exists trg_supplier_product_costs_updated on public.supplier_product_costs;
create trigger trg_supplier_product_costs_updated before update on public.supplier_product_costs for each row execute function public.touch_updated_at();
drop trigger if exists trg_workspace_seed_defaults on public.workspaces;
create trigger trg_workspace_seed_defaults after insert on public.workspaces for each row execute function public.seed_workspace_defaults();
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
drop trigger if exists trg_snapshot_lead_product_sale on public.lead_products;
create trigger trg_snapshot_lead_product_sale before insert or update on public.lead_products for each row execute function public.snapshot_lead_product_sale();

grant usage on schema public to anon, authenticated;

grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.crm_sources to authenticated;
grant select, insert, update, delete on public.pipelines to authenticated;
grant select, insert, update, delete on public.pipeline_stages to authenticated;
grant select, insert, update, delete on public.crm_source_funnels to authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert on public.lead_activities to authenticated;
grant select, insert, update, delete on public.product_catalogs to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.lead_products to authenticated;
grant select, insert, update, delete on public.supplier_product_costs to authenticated;

grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter table public.user_roles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.profiles enable row level security;
alter table public.crm_sources enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.crm_source_funnels enable row level security;
alter table public.companies enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.product_catalogs enable row level security;
alter table public.products enable row level security;
alter table public.lead_products enable row level security;
alter table public.supplier_product_costs enable row level security;

drop policy if exists "users read own roles" on public.user_roles;
create policy "users read own roles" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "members view workspace" on public.workspaces;
create policy "members view workspace" on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "authenticated create workspace" on public.workspaces;
create policy "authenticated create workspace" on public.workspaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "owner updates workspace" on public.workspaces;
create policy "owner updates workspace" on public.workspaces
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.has_role((select auth.uid()), 'super_admin'))
  with check (owner_id = (select auth.uid()) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "owner deletes workspace" on public.workspaces;
create policy "owner deletes workspace" on public.workspaces
  for delete to authenticated
  using (owner_id = (select auth.uid()) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "members view memberships" on public.workspace_members;
create policy "members view memberships" on public.workspace_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_workspace_member(workspace_id, (select auth.uid()))
    or public.has_role((select auth.uid()), 'super_admin')
  );

drop policy if exists "owner manages members" on public.workspace_members;
create policy "owner manages members" on public.workspace_members
  for all to authenticated
  using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))
    or public.has_role((select auth.uid()), 'super_admin')
  )
  with check (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))
    or public.has_role((select auth.uid()), 'super_admin')
  );

drop policy if exists "users view own profile" on public.profiles;
create policy "users view own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "ws members manage crm_sources" on public.crm_sources;
create policy "ws members manage crm_sources" on public.crm_sources
  for all to authenticated
  using (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'))
  with check (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage pipelines" on public.pipelines;
create policy "ws members manage pipelines" on public.pipelines
  for all to authenticated
  using (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'))
  with check (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage pipeline_stages" on public.pipeline_stages;
create policy "ws members manage pipeline_stages" on public.pipeline_stages
  for all to authenticated
  using (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'))
  with check (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage crm_source_funnels" on public.crm_source_funnels;
create policy "ws members manage crm_source_funnels" on public.crm_source_funnels
  for all to authenticated
  using (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'))
  with check (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage companies" on public.companies;
create policy "ws members manage companies" on public.companies
  for all to authenticated
  using (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'))
  with check (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage leads" on public.leads;
create policy "ws members manage leads" on public.leads
  for all to authenticated
  using (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'))
  with check (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members read activities" on public.lead_activities;
create policy "ws members read activities" on public.lead_activities
  for select to authenticated
  using (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members insert activities" on public.lead_activities;
create policy "ws members insert activities" on public.lead_activities
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage product_catalogs" on public.product_catalogs;
create policy "ws members manage product_catalogs" on public.product_catalogs
  for all to authenticated
  using (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'))
  with check (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage products" on public.products;
create policy "ws members manage products" on public.products
  for all to authenticated
  using (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'))
  with check (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage lead_products" on public.lead_products;
create policy "ws members manage lead_products" on public.lead_products
  for all to authenticated
  using (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'))
  with check (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage supplier_product_costs" on public.supplier_product_costs;
create policy "ws members manage supplier_product_costs" on public.supplier_product_costs
  for all to authenticated
  using (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'))
  with check (public.is_workspace_member(workspace_id, (select auth.uid())) or public.has_role((select auth.uid()), 'super_admin'));

revoke all on function public.has_role(uuid, public.app_role) from public;
revoke all on function public.is_workspace_member(uuid, uuid) from public;
revoke all on function public.generate_workspace_slug(text) from public;
revoke all on function public.seed_workspace_defaults() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.snapshot_lead_product_sale() from public;

grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_workspace_member(uuid, uuid) to authenticated, service_role;
