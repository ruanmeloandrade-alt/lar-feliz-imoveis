-- Move RLS helper logic out of the exposed public API schema.

create schema if not exists private;

create or replace function private.has_role(_user_id uuid, _role public.app_role)
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

create or replace function private.is_workspace_member(_workspace_id uuid, _user_id uuid)
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

grant usage on schema private to authenticated, service_role;
grant execute on function private.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function private.is_workspace_member(uuid, uuid) to authenticated, service_role;

drop policy if exists "users read own roles" on public.user_roles;
create policy "users read own roles" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "members view workspace" on public.workspaces;
create policy "members view workspace" on public.workspaces
  for select to authenticated
  using (private.is_workspace_member(id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "owner updates workspace" on public.workspaces;
create policy "owner updates workspace" on public.workspaces
  for update to authenticated
  using (owner_id = (select auth.uid()) or private.has_role((select auth.uid()), 'super_admin'))
  with check (owner_id = (select auth.uid()) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "owner deletes workspace" on public.workspaces;
create policy "owner deletes workspace" on public.workspaces
  for delete to authenticated
  using (owner_id = (select auth.uid()) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "members view memberships" on public.workspace_members;
create policy "members view memberships" on public.workspace_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_workspace_member(workspace_id, (select auth.uid()))
    or private.has_role((select auth.uid()), 'super_admin')
  );

drop policy if exists "owner manages members" on public.workspace_members;
create policy "owner manages members" on public.workspace_members
  for all to authenticated
  using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))
    or private.has_role((select auth.uid()), 'super_admin')
  )
  with check (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))
    or private.has_role((select auth.uid()), 'super_admin')
  );

drop policy if exists "users view own profile" on public.profiles;
create policy "users view own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage crm_sources" on public.crm_sources;
create policy "ws members manage crm_sources" on public.crm_sources
  for all to authenticated
  using (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage pipelines" on public.pipelines;
create policy "ws members manage pipelines" on public.pipelines
  for all to authenticated
  using (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage pipeline_stages" on public.pipeline_stages;
create policy "ws members manage pipeline_stages" on public.pipeline_stages
  for all to authenticated
  using (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage crm_source_funnels" on public.crm_source_funnels;
create policy "ws members manage crm_source_funnels" on public.crm_source_funnels
  for all to authenticated
  using (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage companies" on public.companies;
create policy "ws members manage companies" on public.companies
  for all to authenticated
  using (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage leads" on public.leads;
create policy "ws members manage leads" on public.leads
  for all to authenticated
  using (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members read activities" on public.lead_activities;
create policy "ws members read activities" on public.lead_activities
  for select to authenticated
  using (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members insert activities" on public.lead_activities;
create policy "ws members insert activities" on public.lead_activities
  for insert to authenticated
  with check (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage product_catalogs" on public.product_catalogs;
create policy "ws members manage product_catalogs" on public.product_catalogs
  for all to authenticated
  using (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage products" on public.products;
create policy "ws members manage products" on public.products
  for all to authenticated
  using (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage lead_products" on public.lead_products;
create policy "ws members manage lead_products" on public.lead_products
  for all to authenticated
  using (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

drop policy if exists "ws members manage supplier_product_costs" on public.supplier_product_costs;
create policy "ws members manage supplier_product_costs" on public.supplier_product_costs
  for all to authenticated
  using (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.is_workspace_member(workspace_id, (select auth.uid())) or private.has_role((select auth.uid()), 'super_admin'));

revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.is_workspace_member(uuid, uuid) from public, anon, authenticated;
