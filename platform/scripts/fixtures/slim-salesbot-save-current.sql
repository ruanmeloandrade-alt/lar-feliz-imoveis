CREATE OR REPLACE FUNCTION public.salesbot_save_graph_v2(p_bot_local_id text, p_expected_revision integer, p_base_block_local_ids text[], p_bot jsonb, p_blocks jsonb, p_request_id uuid, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_ws uuid;v_id uuid;v_rev integer;v_base text[];v_count integer;v_row jsonb;v_ids text[];v_deleted integer;v_new boolean:=false;
begin
 select current_workspace_id into v_ws from public.profiles where id=auth.uid();
 if v_ws is null then raise exception 'workspace_not_found'; end if;
 perform 1 from public.workspace_members where workspace_id=v_ws and user_id=auth.uid();
 if not found then raise exception 'workspace_forbidden'; end if;
 select id,revision into v_id,v_rev from public.salesbots where workspace_id=v_ws and local_id=p_bot_local_id for update;
 if v_id is null then
  if p_expected_revision is not null then raise exception 'salesbot_missing_for_expected_revision'; end if;
  insert into public.salesbots(workspace_id,local_id,name,scope,gatilhos,settings)
   values(v_ws,p_bot_local_id,coalesce(p_bot->>'name','Novo bot'),coalesce(p_bot->>'scope','individual'),coalesce(p_bot->'gatilhos','[]'::jsonb),p_bot)
   returning id,revision into v_id,v_rev;
  v_new:=true;
 else
  if p_expected_revision is distinct from v_rev then raise exception 'salesbot_revision_conflict'; end if;
  select coalesce(array_agg(local_id order by local_id),array[]::text[]) into v_base from public.salesbot_blocks where salesbot_id=v_id;
  select coalesce(array_agg(x order by x),array[]::text[]) into v_ids from unnest(coalesce(p_base_block_local_ids,array[]::text[])) x;
  if v_base is distinct from v_ids then raise exception 'salesbot_incomplete_base'; end if;
  update public.salesbots set name=coalesce(p_bot->>'name',name),scope=coalesce(p_bot->>'scope',scope),
   gatilhos=coalesce(p_bot->'gatilhos',gatilhos),settings=p_bot,revision=revision+1,updated_at=now()
   where id=v_id returning revision into v_rev;
 end if;
 select count(*) into v_count from public.salesbot_blocks where salesbot_id=v_id;
 delete from public.salesbot_blocks where salesbot_id=v_id;
 for v_row in select value from jsonb_array_elements(coalesce(p_blocks,'[]'::jsonb)) loop
  insert into public.salesbot_blocks(id,salesbot_id,workspace_id,local_id,type,config,position_x,position_y,next_block_id)
   values((v_row->>'id')::uuid,v_id,v_ws,v_row->>'local_id',v_row->>'type',coalesce(v_row->'config','{}'::jsonb),
   coalesce((v_row->>'position_x')::integer,0),coalesce((v_row->>'position_y')::integer,0),nullif(v_row->>'next_block_id','')::uuid);
 end loop;
 insert into public.salesbot_revisions(workspace_id,salesbot_id,revision,source_event,actor_user_id,request_id)
 values(v_ws,v_id,v_rev,p_source,auth.uid(),p_request_id);
 return jsonb_build_object('id',v_id,'revision',v_rev,'baseBlockLocalIds',
  coalesce((select jsonb_agg(local_id order by local_id) from public.salesbot_blocks where salesbot_id=v_id),'[]'::jsonb),
  'deletedBlockCount',greatest(v_count-coalesce(jsonb_array_length(p_blocks),0),0),'requestId',p_request_id);
end $function$
