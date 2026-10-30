-- Same customer can have independent WhatsApp cards, one per company session.
drop index public.leads_wa_workspace_phone_active_unique;
create unique index leads_wa_workspace_phone_active_unique on public.leads
  (workspace_id, phone_normalized, (coalesce(custom_data->>'whatsapp_session_id','')))
  where source='whatsapp' and merged_into_id is null and phone_normalized is not null;

create or replace function private.slim_guard_whatsapp_origin() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare old_session text; new_session text; target_session text;
begin
  new_session:=nullif(btrim(new.custom_data->>'whatsapp_session_id'),'');
  if tg_op='UPDATE' then
    old_session:=nullif(btrim(old.custom_data->>'whatsapp_session_id'),'');
    if old_session is not null and (old_session is distinct from new_session or old.workspace_id is distinct from new.workspace_id) then
      raise exception 'O WhatsApp de origem deste atendimento não pode ser alterado. Use o card do outro número.' using errcode='23514';
    end if;
  end if;
  if new_session is not null and (tg_op='INSERT' or old_session is null) then
    if not exists(select 1 from public.whatsapp_web_sessions s where s.id::text=new_session and s.workspace_id=new.workspace_id) then
      raise exception 'A conexão de WhatsApp não pertence à empresa deste atendimento.' using errcode='23514';
    end if;
  end if;
  if new.merged_into_id is not null then
    select nullif(btrim(l.custom_data->>'whatsapp_session_id'),'') into target_session from public.leads l where l.id=new.merged_into_id and l.workspace_id=new.workspace_id;
    if new_session is not null and target_session is distinct from new_session then
      raise exception 'Atendimentos de números de WhatsApp diferentes não podem ser mesclados.' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.slim_guard_whatsapp_origin() from public,anon,authenticated;
create trigger slim_guard_whatsapp_origin before insert or update of custom_data,workspace_id,merged_into_id
  on public.leads for each row execute function private.slim_guard_whatsapp_origin();

-- A provider message ID collision cannot move a stored message to another session.
create or replace function private.slim_guard_whatsapp_message_origin() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if old.session_id is distinct from new.session_id or old.workspace_id is distinct from new.workspace_id then
    raise exception 'A mensagem pertence a outra conexão de WhatsApp.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.slim_guard_whatsapp_message_origin() from public,anon,authenticated;
create trigger slim_guard_whatsapp_message_origin before update of session_id,workspace_id
  on public.whatsapp_web_messages for each row execute function private.slim_guard_whatsapp_message_origin();

alter table public.slim_audience_deliveries add column origin_session_id uuid references public.whatsapp_web_sessions(id);
create or replace function private.slim_audience_delivery_origin() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare origin text; campaign_session uuid; kind text;
begin
  select nullif(btrim(l.custom_data->>'whatsapp_session_id'),'') into origin
    from public.leads l where l.id=new.lead_id and l.workspace_id=new.workspace_id;
  select c.session_id,c.kind into campaign_session,kind from public.slim_audience_campaigns c
    where c.id=new.campaign_id and c.workspace_id=new.workspace_id;
  new.origin_session_id:=coalesce(origin::uuid,campaign_session);
  if new.origin_session_id is not null and not exists(select 1 from public.whatsapp_web_sessions s where s.id=new.origin_session_id and s.workspace_id=new.workspace_id) then
    raise exception 'O WhatsApp de origem do disparo não pertence à empresa.' using errcode='23514';
  end if;
  if kind is distinct from 'salesbot' then
    new.recipient_key:=coalesce(new.origin_session_id::text,'unbound')||':'||new.phone;
  end if;
  return new;
end $$;
revoke all on function private.slim_audience_delivery_origin() from public,anon,authenticated;
create trigger slim_audience_delivery_origin before insert on public.slim_audience_deliveries
  for each row execute function private.slim_audience_delivery_origin();
