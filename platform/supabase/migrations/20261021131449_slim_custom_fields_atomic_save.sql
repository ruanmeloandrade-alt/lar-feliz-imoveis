create or replace function public.slim_save_custom_fields(p_deleted_ids uuid[], p_updated jsonb, p_created jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $function$
declare v_ws uuid; v_field jsonb; v_id uuid; v_count integer; v_existing public.lead_custom_fields;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select current_workspace_id into v_ws from public.profiles where id=auth.uid();
  if v_ws is null or not private.slim_workspace_access(v_ws,'operator') then
    raise exception 'workspace_forbidden' using errcode='42501';
  end if;
  if jsonb_typeof(p_updated) is distinct from 'array' or jsonb_typeof(p_created) is distinct from 'array' then
    raise exception 'invalid_custom_fields';
  end if;
  foreach v_id in array coalesce(p_deleted_ids,array[]::uuid[]) loop
    -- FK cascade removes values in the same transaction, never before confirmation.
    delete from public.lead_custom_fields where workspace_id=v_ws and id=v_id;
  end loop;
  for v_field in select value from jsonb_array_elements(p_updated) loop
    update public.lead_custom_fields set name=v_field->>'name',field_type=v_field->>'fieldType',options=coalesce(v_field->'options','[]')
    where id=(v_field->>'id')::uuid and workspace_id=v_ws;
    get diagnostics v_count=row_count;
    if v_count<>1 then raise exception 'Campo não encontrado ou sem permissão para editar.'; end if;
  end loop;
  for v_field in select value from jsonb_array_elements(p_created) loop
    insert into public.lead_custom_fields(id,workspace_id,name,field_type,options)
    values((v_field->>'id')::uuid,v_ws,v_field->>'name',v_field->>'fieldType',coalesce(v_field->'options','[]'))
    on conflict(id) do nothing;
    select * into v_existing from public.lead_custom_fields where id=(v_field->>'id')::uuid and workspace_id=v_ws;
    if not found or v_existing.name is distinct from v_field->>'name'
      or v_existing.field_type is distinct from v_field->>'fieldType'
      or v_existing.options is distinct from coalesce(v_field->'options','[]') then
      raise exception 'Conflito ao confirmar o campo personalizado.';
    end if;
  end loop;
  if exists(select 1 from public.lead_custom_fields where workspace_id=v_ws and id=any(coalesce(p_deleted_ids,array[]::uuid[]))) then
    raise exception 'O banco não confirmou a exclusão dos campos.';
  end if;
  return jsonb_build_object('ok',true);
end $function$;
revoke all on function public.slim_save_custom_fields(uuid[],jsonb,jsonb) from public,anon;
grant execute on function public.slim_save_custom_fields(uuid[],jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
