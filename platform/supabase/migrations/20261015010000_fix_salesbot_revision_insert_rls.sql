-- Root cause reproduced as role authenticated: SQLSTATE 42501 on the
-- salesbot_revisions INSERT rolled back the complete save/activation RPC.
-- Applied to the dedicated Saude Slim database; keep RLS enabled.
do $migration$
begin
 if not exists (select 1 from pg_policies where schemaname='public' and tablename='salesbot_revisions' and policyname='salesbot_revisions_insert_own_workspace') then
  create policy salesbot_revisions_insert_own_workspace
  on public.salesbot_revisions for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and exists (select 1 from public.workspace_members m
      where m.workspace_id=salesbot_revisions.workspace_id and m.user_id=(select auth.uid()))
    and exists (select 1 from public.salesbots b
      where b.id=salesbot_revisions.salesbot_id
        and b.workspace_id=salesbot_revisions.workspace_id
        and b.revision=salesbot_revisions.revision)
  );
 end if;
end $migration$;
grant insert on public.salesbot_revisions to authenticated;
