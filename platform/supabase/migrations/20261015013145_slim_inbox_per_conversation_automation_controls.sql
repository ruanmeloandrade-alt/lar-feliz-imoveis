create table public.conversation_ai_agents (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 name text not null, persona text, system_prompt text, model text not null default 'openai/gpt-4o-mini',
 temperature numeric not null default 0.7, max_tokens integer not null default 1024,
 cooldown_seconds integer not null default 15, enabled boolean not null default false,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id)
);
alter table public.leads add column active_conversation_agent_id uuid references public.conversation_ai_agents(id) on delete set null;
alter table public.leads add column active_conversation_agent_version bigint not null default 0;
alter table public.leads add column active_conversation_agent_started_at timestamptz;
create unique index if not exists slim_leads_workspace_id_id on public.leads(workspace_id,id);
create unique index if not exists slim_salesbots_workspace_id_id on public.salesbots(workspace_id,id);
create table public.salesbot_runs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 salesbot_id uuid not null, lead_id uuid not null, current_block_id uuid,
 status text not null default 'running' check (status in ('queued','pending','running','waiting','waiting_timer','waiting_message','paused','finished','error','cancelled')),
 variables jsonb not null default '{}'::jsonb, waiting_until timestamptz,
 started_at timestamptz not null default now(), updated_at timestamptz not null default now(), finished_at timestamptz,
 last_error text, request_id uuid, actor_user_id uuid, stopped_at timestamptz, stopped_by uuid,
 foreign key(workspace_id,salesbot_id) references public.salesbots(workspace_id,id) on delete cascade,
 foreign key(workspace_id,lead_id) references public.leads(workspace_id,id) on delete cascade,
 unique(workspace_id,request_id), unique(workspace_id,id)
);
create unique index slim_one_live_salesbot_per_lead on public.salesbot_runs(workspace_id,lead_id,salesbot_id)
 where status in ('queued','pending','running','waiting','waiting_timer','waiting_message','paused');
create index slim_salesbot_run_inbox on public.salesbot_runs(workspace_id,lead_id,status);
create index slim_salesbot_run_timer on public.salesbot_runs(waiting_until) where status in ('waiting_timer','waiting_message');
create table public.salesbot_run_logs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 salesbot_run_id uuid not null, block_id uuid, status text not null, message text,
 payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 foreign key(workspace_id,salesbot_run_id) references public.salesbot_runs(workspace_id,id) on delete cascade
);
create index slim_salesbot_logs_run on public.salesbot_run_logs(salesbot_run_id,created_at);
create table public.conversation_agent_runs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 agent_id uuid not null, lead_id uuid, channel text, interactions_count integer not null default 0,
 objective_reached boolean not null default false, objective_reached_at timestamptz,
 started_at timestamptz not null default now(), last_message_at timestamptz,
 metadata jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(),
 foreign key(workspace_id,agent_id) references public.conversation_ai_agents(workspace_id,id) on delete cascade,
 foreign key(workspace_id,lead_id) references public.leads(workspace_id,id) on delete cascade
);
create or replace function private.slim_inbox_guard_run() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if old.stopped_at is not null then return old; end if;
 new.updated_at:=clock_timestamp(); return new;
end $$;
create trigger slim_inbox_run_guard before update on public.salesbot_runs for each row execute function private.slim_inbox_guard_run();
create or replace function private.slim_inbox_agent_version() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.active_conversation_agent_id is not null and not exists(select 1 from public.conversation_ai_agents a where a.id=new.active_conversation_agent_id and a.workspace_id=new.workspace_id) then
  raise exception 'Agente IA não pertence a esta empresa.' using errcode='42501';
 end if;
 if new.active_conversation_agent_id is distinct from old.active_conversation_agent_id or new.ai_paused is distinct from old.ai_paused then
  new.active_conversation_agent_version:=old.active_conversation_agent_version+1;
  new.active_conversation_agent_started_at:=case when new.active_conversation_agent_id is not null and not new.ai_paused then clock_timestamp() else null end;
 else new.active_conversation_agent_version:=old.active_conversation_agent_version;
 end if;
 return new;
end $$;
create trigger slim_inbox_agent_version before update on public.leads for each row execute function private.slim_inbox_agent_version();
alter table public.conversation_ai_agents enable row level security;
alter table public.conversation_agent_runs enable row level security;
alter table public.salesbot_runs enable row level security;
alter table public.salesbot_run_logs enable row level security;
create policy slim_conversation_agents_members on public.conversation_ai_agents for all to authenticated
 using(private.is_workspace_member(workspace_id,(select auth.uid()))) with check(private.is_workspace_member(workspace_id,(select auth.uid())));
create policy slim_conversation_runs_read on public.conversation_agent_runs for select to authenticated using(private.is_workspace_member(workspace_id,(select auth.uid())));
create policy slim_salesbot_runs_read on public.salesbot_runs for select to authenticated using(private.is_workspace_member(workspace_id,(select auth.uid())));
create policy slim_salesbot_logs_read on public.salesbot_run_logs for select to authenticated using(private.is_workspace_member(workspace_id,(select auth.uid())));
revoke all on public.salesbot_runs,public.salesbot_run_logs,public.conversation_agent_runs,public.conversation_ai_agents from anon,authenticated;
grant select on public.salesbot_runs,public.salesbot_run_logs,public.conversation_agent_runs to authenticated;
grant select,insert,update,delete on public.conversation_ai_agents to authenticated;
grant all on public.salesbot_runs,public.salesbot_run_logs,public.conversation_agent_runs,public.conversation_ai_agents to service_role;
create or replace function private.slim_inbox_assert_target(p_workspace_id uuid,p_lead_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p join public.workspace_members m on m.workspace_id=p.current_workspace_id and m.user_id=p.id where p.id=auth.uid() and p.current_workspace_id=p_workspace_id) then
  raise exception 'Sessão ou empresa ativa mudou. Reabra esta conversa.' using errcode='42501';
 end if;
 if not exists(select 1 from public.leads where id=p_lead_id and workspace_id=p_workspace_id and coalesce(phone,'') not like '%@g.us') then
  raise exception 'Conversa individual não encontrada nesta empresa.' using errcode='42501';
 end if;
end $$;
create or replace function public.slim_inbox_start_salesbot(p_workspace_id uuid,p_lead_id uuid,p_salesbot_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.salesbot_runs; b public.salesbots; rid uuid:=gen_random_uuid();
begin
 perform private.slim_inbox_assert_target(p_workspace_id,p_lead_id);
 if p_request_id is null then raise exception 'Identificador da solicitação obrigatório.'; end if;
 perform 1 from public.leads where id=p_lead_id and workspace_id=p_workspace_id for update;
 select * into r from public.salesbot_runs where workspace_id=p_workspace_id and request_id=p_request_id;
 if found then
  if r.lead_id<>p_lead_id or r.salesbot_id<>p_salesbot_id then raise exception 'Solicitação pertence a outra execução.' using errcode='42501'; end if;
  return jsonb_build_object('ok',true,'runId',r.id,'status',r.status,'reused',true);
 end if;
 select * into b from public.salesbots where id=p_salesbot_id and workspace_id=p_workspace_id for share;
 if not found or not b.is_active or b.scope<>'individual' then raise exception 'Selecione um SalesBot individual ativo desta empresa.'; end if;
 if not exists(select 1 from public.salesbot_blocks where salesbot_id=b.id and workspace_id=p_workspace_id) then raise exception 'Este SalesBot não possui blocos salvos.'; end if;
 select * into r from public.salesbot_runs where workspace_id=p_workspace_id and lead_id=p_lead_id and salesbot_id=p_salesbot_id and status in ('queued','pending','running','waiting','waiting_timer','waiting_message','paused');
 if found then return jsonb_build_object('ok',true,'runId',r.id,'status',r.status,'reused',true); end if;
 insert into public.salesbot_runs(id,workspace_id,salesbot_id,lead_id,status,request_id,actor_user_id,variables)
 values(rid,p_workspace_id,p_salesbot_id,p_lead_id,'queued',p_request_id,auth.uid(),jsonb_build_object('trigger','inbox-manual','source','inbox_manual_control'));
 insert into public.salesbot_run_logs(workspace_id,salesbot_run_id,status,message,payload)
 values(p_workspace_id,rid,'ok','Iniciado manualmente no Inbox.',jsonb_build_object('actor_user_id',auth.uid(),'request_id',p_request_id));
 return jsonb_build_object('ok',true,'runId',rid,'status','queued','reused',false);
end $$;
create or replace function public.slim_inbox_stop_salesbot(p_workspace_id uuid,p_lead_id uuid,p_run_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.salesbot_runs; changed boolean:=false;
begin
 perform private.slim_inbox_assert_target(p_workspace_id,p_lead_id);
 select * into r from public.salesbot_runs where id=p_run_id and workspace_id=p_workspace_id and lead_id=p_lead_id for update;
 if not found then raise exception 'Execução não encontrada nesta conversa.' using errcode='42501'; end if;
 if r.status in ('queued','pending','running','waiting','waiting_timer','waiting_message','paused') then
  update public.salesbot_runs set status='finished',stopped_at=clock_timestamp(),stopped_by=auth.uid(),finished_at=clock_timestamp(),waiting_until=null,current_block_id=null,last_error=null where id=r.id;
  insert into public.salesbot_run_logs(workspace_id,salesbot_run_id,status,message,payload)
  values(p_workspace_id,r.id,'ok','Encerrado manualmente no Inbox.',jsonb_build_object('actor_user_id',auth.uid()));
  changed:=true;
 end if;
 return jsonb_build_object('ok',true,'runId',r.id,'stopped',changed);
end $$;
create or replace function public.slim_inbox_set_agent(p_workspace_id uuid,p_lead_id uuid,p_agent_id uuid,p_action text,p_expected_version bigint default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.leads; a public.conversation_ai_agents; v bigint;
begin
 perform private.slim_inbox_assert_target(p_workspace_id,p_lead_id);
 select * into l from public.leads where id=p_lead_id and workspace_id=p_workspace_id for update;
 if p_action='start' then
  select * into a from public.conversation_ai_agents where id=p_agent_id and workspace_id=p_workspace_id and enabled for share;
  if not found then raise exception 'Selecione um Agente IA ativo desta empresa.'; end if;
  if l.active_conversation_agent_id is not null and not l.ai_paused then
   if l.active_conversation_agent_id=p_agent_id then return jsonb_build_object('ok',true,'agentId',p_agent_id,'version',l.active_conversation_agent_version,'reused',true); end if;
   raise exception 'Encerre o agente atual desta conversa antes de iniciar outro.';
  end if;
  update public.leads set active_conversation_agent_id=p_agent_id,ai_paused=false,updated_at=clock_timestamp() where id=l.id returning active_conversation_agent_version into v;
  insert into public.lead_activities(workspace_id,lead_id,type,payload) values(p_workspace_id,p_lead_id,'note',jsonb_build_object('text','Agente IA '||a.name||' iniciado nesta conversa.','source','inbox_manual_control','agent_id',a.id,'version',v));
 elsif p_action='stop' then
  if l.active_conversation_agent_id is distinct from p_agent_id or l.active_conversation_agent_version is distinct from p_expected_version then raise exception 'O agente desta conversa mudou. Atualize a lista antes de encerrar.'; end if;
  update public.leads set active_conversation_agent_id=null,ai_paused=true,updated_at=clock_timestamp() where id=l.id returning active_conversation_agent_version into v;
  insert into public.lead_activities(workspace_id,lead_id,type,payload) values(p_workspace_id,p_lead_id,'note',jsonb_build_object('text','Agente IA encerrado nesta conversa.','source','inbox_manual_control','agent_id',p_agent_id,'version',v));
 else raise exception 'Ação inválida.';
 end if;
 return jsonb_build_object('ok',true,'agentId',p_agent_id,'version',v,'reused',false);
end $$;
create or replace function public.slim_inbox_automation_state(p_workspace_id uuid,p_lead_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform private.slim_inbox_assert_target(p_workspace_id,p_lead_id);
 select jsonb_build_object('workspaceId',p_workspace_id,'leadId',p_lead_id,
 'bots',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from public.salesbots s where s.workspace_id=p_workspace_id and s.is_active and s.scope='individual'),'[]'::jsonb),
 'agents',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) order by a.name) from public.conversation_ai_agents a where a.workspace_id=p_workspace_id and a.enabled),'[]'::jsonb),
 'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'botId',r.salesbot_id,'name',s.name,'status',r.status,'startedAt',r.started_at) order by r.started_at) from public.salesbot_runs r join public.salesbots s on s.id=r.salesbot_id and s.workspace_id=r.workspace_id where r.workspace_id=p_workspace_id and r.lead_id=p_lead_id and r.status in ('queued','pending','running','waiting','waiting_timer','waiting_message','paused')),'[]'::jsonb),
 'activeAgent',(select jsonb_build_object('id',a.id,'name',a.name,'version',l.active_conversation_agent_version,'paused',l.ai_paused,'startedAt',l.active_conversation_agent_started_at) from public.leads l join public.conversation_ai_agents a on a.id=l.active_conversation_agent_id and a.workspace_id=l.workspace_id where l.id=p_lead_id and l.workspace_id=p_workspace_id)) into result;
 return result;
end $$;
create or replace function public.slim_claim_inbox_salesbots() returns setof public.salesbot_runs language sql security definer set search_path=public,pg_temp as $$
 with candidates as (select id from public.salesbot_runs where status='queued' and stopped_at is null order by started_at for update skip locked limit 5)
 update public.salesbot_runs r set status='running',updated_at=clock_timestamp() from candidates c where r.id=c.id returning r.*;
$$;
revoke all on function private.slim_inbox_assert_target(uuid,uuid),private.slim_inbox_guard_run(),private.slim_inbox_agent_version() from public,anon,authenticated;
revoke all on function public.slim_inbox_start_salesbot(uuid,uuid,uuid,uuid),public.slim_inbox_stop_salesbot(uuid,uuid,uuid),public.slim_inbox_set_agent(uuid,uuid,uuid,text,bigint),public.slim_inbox_automation_state(uuid,uuid),public.slim_claim_inbox_salesbots() from public,anon,authenticated;
grant execute on function public.slim_inbox_start_salesbot(uuid,uuid,uuid,uuid),public.slim_inbox_stop_salesbot(uuid,uuid,uuid),public.slim_inbox_set_agent(uuid,uuid,uuid,text,bigint),public.slim_inbox_automation_state(uuid,uuid) to authenticated;
grant execute on function public.slim_claim_inbox_salesbots() to service_role;
alter publication supabase_realtime add table public.salesbot_runs,public.salesbots,public.conversation_ai_agents;
notify pgrst,'reload schema';