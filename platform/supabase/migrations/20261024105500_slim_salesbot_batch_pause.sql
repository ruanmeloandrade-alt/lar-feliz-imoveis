-- Restore the existing runtime RPC; only the trusted executor may consume a batch.
create function public.salesbot_batch_decrement(
  p_run_id uuid,p_text text,p_sender_phone text,p_sender_name text,p_next_block_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare v_run public.salesbot_runs; v_vars jsonb; v_events jsonb; v_event jsonb;
  v_index integer := -1; v_remaining integer; i integer;
begin
  select * into v_run from public.salesbot_runs
    where id=p_run_id and status='waiting_message' and stopped_at is null for update;
  if not found then return jsonb_build_object('success',false,'reason','run_not_waiting'); end if;
  if p_next_block_id is not null and not exists (
    select 1 from public.salesbot_blocks where id=p_next_block_id
      and workspace_id=v_run.workspace_id and salesbot_id=v_run.salesbot_id
  ) then raise exception 'batch_target_forbidden'; end if;
  v_vars := coalesce(v_run.variables,'{}');
  v_events := v_vars->'salesbot_waiting_branch'->'waitingEvents';
  if jsonb_typeof(v_events) is distinct from 'array' then
    return jsonb_build_object('success',false,'reason','lote_event_not_found');
  end if;
  for i in 0..jsonb_array_length(v_events)-1 loop
    v_event := v_events->i;
    if v_event->>'type'='lote-msgs' then
      v_index := i; v_remaining := (v_event->>'remaining')::integer; exit;
    end if;
  end loop;
  if v_index=-1 then return jsonb_build_object('success',false,'reason','lote_event_not_found'); end if;
  if v_remaining is null or v_remaining<1 or v_remaining>200 then raise exception 'invalid_batch_state'; end if;
  if p_sender_phone is not null then v_vars := v_vars||jsonb_build_object(
    'participante_telefone',regexp_replace(p_sender_phone,'[^0-9]','','g'),
    'participante_nome',coalesce(p_sender_name,'')); end if;
  v_vars := v_vars||jsonb_build_object('last_message',p_text);
  v_remaining := v_remaining-1;
  if v_remaining>0 then
    v_vars := jsonb_set(v_vars,array['salesbot_waiting_branch','waitingEvents',v_index::text,'remaining'],to_jsonb(v_remaining));
    update public.salesbot_runs set variables=v_vars,updated_at=clock_timestamp() where id=p_run_id;
  else
    v_vars := (v_vars-'salesbot_waiting_branch')||jsonb_build_object('salesbot_lote_completo',true);
    update public.salesbot_runs set status='running',waiting_until=null,variables=v_vars,
      current_block_id=p_next_block_id,updated_at=clock_timestamp() where id=p_run_id;
  end if;
  return jsonb_build_object('success',true,'completed',v_remaining=0,'remaining',v_remaining);
end $function$;
revoke all on function public.salesbot_batch_decrement(uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.salesbot_batch_decrement(uuid,text,text,text,uuid) to service_role;
