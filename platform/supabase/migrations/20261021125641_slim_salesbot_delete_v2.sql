-- Restore the RPC already called by the published SalesBot deletion endpoint.
-- Caller permissions and existing session/workspace RLS remain authoritative.
create or replace function public.salesbot_delete_v2(
  p_bot_local_id text,
  p_expected_revision integer,
  p_request_id uuid,
  p_source text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_ws uuid;
  v_id uuid;
  v_revision integer;
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  if nullif(btrim(p_bot_local_id), '') is null
     or p_expected_revision is null or p_expected_revision <= 0 then
    raise exception 'salesbot_invalid_delete_request';
  end if;

  select current_workspace_id into v_ws
  from public.profiles where id = auth.uid();
  if v_ws is null then raise exception 'workspace_not_found'; end if;
  perform 1 from public.workspace_members
  where workspace_id = v_ws and user_id = auth.uid();
  if not found then raise exception 'workspace_forbidden'; end if;

  select id, revision into v_id, v_revision
  from public.salesbots
  where workspace_id = v_ws
    and (local_id = p_bot_local_id
      or (local_id is null and id::text = p_bot_local_id))
  for update;
  if not found then
    return jsonb_build_object('ok', true, 'alreadyDeleted', true, 'requestId', p_request_id);
  end if;
  if v_revision is distinct from p_expected_revision then
    raise exception 'salesbot_revision_conflict';
  end if;

  -- Existing FK cascades remove child records atomically. Referenced campaigns
  -- keep their restrictive FK, so a failure rolls the entire deletion back.
  delete from public.salesbots
  where id = v_id and workspace_id = v_ws and revision = p_expected_revision;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then raise exception 'salesbot_delete_not_confirmed'; end if;
  return jsonb_build_object('ok', true, 'deleted', true, 'requestId', p_request_id);
end;
$function$;

revoke all on function public.salesbot_delete_v2(text, integer, uuid, text) from public, anon;
grant execute on function public.salesbot_delete_v2(text, integer, uuid, text) to authenticated;
notify pgrst, 'reload schema';
