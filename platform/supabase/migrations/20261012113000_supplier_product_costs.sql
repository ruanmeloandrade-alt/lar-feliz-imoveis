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

create index if not exists supplier_product_costs_ws_supplier_idx
  on public.supplier_product_costs (workspace_id, supplier_id);

create index if not exists supplier_product_costs_ws_product_idx
  on public.supplier_product_costs (workspace_id, product_id);

drop trigger if exists trg_supplier_product_costs_updated on public.supplier_product_costs;
create trigger trg_supplier_product_costs_updated
  before update on public.supplier_product_costs
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.supplier_product_costs to authenticated;
grant all on public.supplier_product_costs to service_role;

alter table public.supplier_product_costs enable row level security;

drop policy if exists "ws read supplier product costs" on public.supplier_product_costs;
create policy "ws read supplier product costs" on public.supplier_product_costs
  for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()) or public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "ws write supplier product costs" on public.supplier_product_costs;
create policy "ws write supplier product costs" on public.supplier_product_costs
  for all to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()) or public.has_role(auth.uid(), 'super_admin'))
  with check (public.is_workspace_member(workspace_id, auth.uid()) or public.has_role(auth.uid(), 'super_admin'));
