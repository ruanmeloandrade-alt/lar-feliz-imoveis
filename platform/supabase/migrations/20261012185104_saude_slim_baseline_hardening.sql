-- Hardening for the Saude Slim core baseline after Supabase advisors.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.generate_workspace_slug(text) from public, anon, authenticated;
revoke all on function public.seed_workspace_defaults() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.snapshot_lead_product_sale() from public, anon, authenticated;

-- These two are intentionally used by RLS policies, but should not be callable
-- by anon users through the Data API.
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.is_workspace_member(uuid, uuid) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_workspace_member(uuid, uuid) to authenticated, service_role;

create index if not exists workspaces_owner_idx on public.workspaces (owner_id);
create index if not exists profiles_current_workspace_idx on public.profiles (current_workspace_id);
create index if not exists pipelines_crm_source_idx on public.pipelines (crm_source_id);
create index if not exists pipeline_stages_workspace_idx on public.pipeline_stages (workspace_id);
create index if not exists crm_source_funnels_source_idx on public.crm_source_funnels (crm_source_id);
create index if not exists crm_source_funnels_pipeline_idx on public.crm_source_funnels (pipeline_id);
create index if not exists companies_crm_source_idx on public.companies (crm_source_id);
create index if not exists companies_primary_lead_idx on public.companies (primary_lead_id);
create index if not exists companies_responsible_idx on public.companies (responsible_id);
create index if not exists leads_company_idx on public.leads (company_id);
create index if not exists leads_responsible_idx on public.leads (responsible_id);
create index if not exists leads_merged_into_idx on public.leads (merged_into_id);
create index if not exists lead_activities_workspace_idx on public.lead_activities (workspace_id);
create index if not exists lead_products_product_idx on public.lead_products (product_id);
create index if not exists supplier_product_costs_supplier_idx on public.supplier_product_costs (supplier_id);
create index if not exists supplier_product_costs_product_idx on public.supplier_product_costs (product_id);
