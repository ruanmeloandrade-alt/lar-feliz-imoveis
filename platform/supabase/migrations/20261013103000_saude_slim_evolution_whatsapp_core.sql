-- Saúde Slim: suporte mínimo e isolado para sessões WhatsApp Evolution.
-- Não cria cron, webhook remoto, integração MKTon ou dados de terceiros.
-- Credenciais Evolution são cifradas e nunca expostas como coluna selecionável por clientes.

create table if not exists public.whatsapp_web_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'evolution',
  instance_id text not null unique,
  token_encrypted bytea not null,
  webhook_secret text not null unique,
  status text not null default 'configurando',
  phone_number text,
  last_qr text,
  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_sessions_evolution_only check (provider = 'evolution')
);

create index if not exists whatsapp_sessions_workspace_status_idx
  on public.whatsapp_web_sessions (workspace_id, status);

drop trigger if exists whatsapp_sessions_touch_updated_at on public.whatsapp_web_sessions;
create trigger whatsapp_sessions_touch_updated_at before update
  on public.whatsapp_web_sessions for each row
  execute function public.touch_updated_at();

alter table public.whatsapp_web_sessions enable row level security;
revoke all on public.whatsapp_web_sessions from public, anon, authenticated;
grant select (
  id, workspace_id, provider, instance_id, webhook_secret, status,
  phone_number, last_qr, last_connected_at, last_disconnected_at,
  metadata, created_at, updated_at
) on public.whatsapp_web_sessions to authenticated;
grant update (
  status, phone_number, last_qr, last_connected_at, last_disconnected_at,
  metadata, updated_at
) on public.whatsapp_web_sessions to authenticated;
grant all on public.whatsapp_web_sessions to service_role;

create policy "saude slim members read evolution sessions"
  on public.whatsapp_web_sessions for select to authenticated
  using (
    private.is_workspace_member(workspace_id, (select auth.uid()))
    or private.has_role((select auth.uid()), 'super_admin')
  );

create policy "saude slim members update evolution session status"
  on public.whatsapp_web_sessions for update to authenticated
  using (
    private.is_workspace_member(workspace_id, (select auth.uid()))
    or private.has_role((select auth.uid()), 'super_admin')
  )
  with check (
    private.is_workspace_member(workspace_id, (select auth.uid()))
    or private.has_role((select auth.uid()), 'super_admin')
  );

create table if not exists public.whatsapp_web_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id uuid not null references public.whatsapp_web_sessions(id) on delete cascade,
  remote_jid text,
  to_jid text,
  message_id text not null,
  from_me boolean not null default false,
  sender_name text,
  sender_phone text,
  message_type text not null default 'text',
  body text,
  media_url text,
  delivery_status text,
  raw jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint whatsapp_messages_workspace_message_unique unique(workspace_id, message_id)
);

create index if not exists whatsapp_messages_workspace_session_received_idx
  on public.whatsapp_web_messages (workspace_id, session_id, received_at desc);

alter table public.whatsapp_web_messages enable row level security;
revoke all on public.whatsapp_web_messages from public, anon, authenticated;
grant select, insert on public.whatsapp_web_messages to authenticated;
grant all on public.whatsapp_web_messages to service_role;

create policy "saude slim members read evolution messages"
  on public.whatsapp_web_messages for select to authenticated
  using (
    private.is_workspace_member(workspace_id, (select auth.uid()))
    or private.has_role((select auth.uid()), 'super_admin')
  );

create policy "saude slim members insert outbound evolution messages"
  on public.whatsapp_web_messages for insert to authenticated
  with check (
    (
      private.is_workspace_member(workspace_id, (select auth.uid()))
      or private.has_role((select auth.uid()), 'super_admin')
    )
    and exists (
      select 1 from public.whatsapp_web_sessions s
      where s.id = session_id and s.workspace_id = workspace_id
    )
  );

-- As funções privilegiadas ficam no schema privado (fora da Data API).
-- Os wrappers public invoker mantêm os nomes esperados pelo frontend legado.
create or replace function private.saude_slim_assert_workspace_member(_workspace_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.is_workspace_member(_workspace_id, auth.uid())
    or private.has_role(auth.uid(), 'super_admin')
  ) then
    raise exception 'Saude Slim: workspace não autorizado' using errcode='42501';
  end if;
end;
$$;

create or replace function private.saude_slim_set_evolution_credentials(
  _workspace_id uuid, _instance_name text, _api_key text,
  _webhook_secret text, _key text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare _id uuid;
begin
  perform private.saude_slim_assert_workspace_member(_workspace_id);
  if length(coalesce(_instance_name,'')) < 4
     or length(coalesce(_api_key,'')) < 12
     or length(coalesce(_webhook_secret,'')) < 20
     or length(coalesce(_key,'')) < 32 then
    raise exception 'Saude Slim: parâmetros Evolution inválidos';
  end if;
  insert into public.whatsapp_web_sessions
    (workspace_id, provider, instance_id, token_encrypted, webhook_secret)
  values
    (_workspace_id, 'evolution', _instance_name,
     extensions.pgp_sym_encrypt(_api_key, _key, 'cipher-algo=aes256'),
     _webhook_secret)
  returning id into _id;
  return _id;
end;
$$;

create or replace function private.saude_slim_get_evolution_credentials(
  _session_id uuid, _key text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare _session public.whatsapp_web_sessions%rowtype;
begin
  select * into _session from public.whatsapp_web_sessions where id = _session_id;
  if not found then return null; end if;
  perform private.saude_slim_assert_workspace_member(_session.workspace_id);
  return pg_catalog.jsonb_build_object(
    'workspace_id', _session.workspace_id,
    'instance_name', _session.instance_id,
    'api_key', extensions.pgp_sym_decrypt(_session.token_encrypted, _key),
    'webhook_secret', _session.webhook_secret,
    'status', _session.status
  );
end;
$$;

revoke all on function private.saude_slim_assert_workspace_member(uuid)
  from public, anon, authenticated;
revoke all on function private.saude_slim_set_evolution_credentials(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function private.saude_slim_get_evolution_credentials(uuid, text)
  from public, anon, authenticated;
grant execute on function private.saude_slim_assert_workspace_member(uuid) to authenticated, service_role;
grant execute on function private.saude_slim_set_evolution_credentials(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function private.saude_slim_get_evolution_credentials(uuid, text) to authenticated, service_role;

create or replace function public.set_evolution_credentials(
  _workspace_id uuid, _instance_name text, _api_key text,
  _webhook_secret text, _key text
)
returns uuid language sql security invoker set search_path = ''
as $$
  select private.saude_slim_set_evolution_credentials(
    _workspace_id, _instance_name, _api_key, _webhook_secret, _key
  );
$$;

create or replace function public.get_evolution_credentials(
  _session_id uuid, _key text
)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.saude_slim_get_evolution_credentials(_session_id, _key);
$$;

-- Somente o servidor privilegiado que recebe webhooks pode decriptar por secret.
create or replace function public.get_evolution_session_by_secret(
  _webhook_secret text, _key text
)
returns jsonb language sql security invoker set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'session_id', s.id,
    'workspace_id', s.workspace_id,
    'instance_name', s.instance_id,
    'api_key', extensions.pgp_sym_decrypt(s.token_encrypted, _key)
  )
  from public.whatsapp_web_sessions s
  where s.webhook_secret = _webhook_secret
    and (s.metadata->>'deleted') is distinct from 'true'
  limit 1;
$$;

-- Quota do sistema interno Saúde Slim: uma sessão por workspace inicialmente.
create or replace function public.whatsapp_number_limit(_workspace_id uuid)
returns integer language plpgsql security invoker set search_path = ''
as $$
begin
  perform private.saude_slim_assert_workspace_member(_workspace_id);
  return 1;
end;
$$;

create or replace function public.count_active_whatsapp_sessions(_workspace_id uuid)
returns bigint language plpgsql security invoker set search_path = ''
as $$
declare _count bigint;
begin
  perform private.saude_slim_assert_workspace_member(_workspace_id);
  select count(*) into _count from public.whatsapp_web_sessions s
  where s.workspace_id = _workspace_id and s.status <> 'desconectado'
    and (s.metadata->>'deleted') is distinct from 'true';
  return _count;
end;
$$;

revoke all on function public.set_evolution_credentials(uuid,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.get_evolution_credentials(uuid,text)
  from public, anon, authenticated;
revoke all on function public.get_evolution_session_by_secret(text,text)
  from public, anon, authenticated;
revoke all on function public.whatsapp_number_limit(uuid)
  from public, anon, authenticated;
revoke all on function public.count_active_whatsapp_sessions(uuid)
  from public, anon, authenticated;

grant execute on function public.set_evolution_credentials(uuid,text,text,text,text) to authenticated;
grant execute on function public.get_evolution_credentials(uuid,text) to authenticated;
grant execute on function public.get_evolution_session_by_secret(text,text) to service_role;
grant execute on function public.whatsapp_number_limit(uuid) to authenticated;
grant execute on function public.count_active_whatsapp_sessions(uuid) to authenticated;
