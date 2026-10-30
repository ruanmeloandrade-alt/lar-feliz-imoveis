-- Avoid overlapping SELECT policies on workspace_members.

drop policy if exists "owner manages members" on public.workspace_members;

create policy "owner inserts members" on public.workspace_members
  for insert to authenticated
  with check (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))
    or private.has_role((select auth.uid()), 'super_admin')
  );

create policy "owner updates members" on public.workspace_members
  for update to authenticated
  using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))
    or private.has_role((select auth.uid()), 'super_admin')
  )
  with check (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))
    or private.has_role((select auth.uid()), 'super_admin')
  );

create policy "owner deletes members" on public.workspace_members
  for delete to authenticated
  using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))
    or private.has_role((select auth.uid()), 'super_admin')
  );
