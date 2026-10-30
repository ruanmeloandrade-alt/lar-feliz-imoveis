-- Restore existing team-chat contracts; retain native session and workspace checks.
create function public.can_admin_workspace(_user_id uuid,_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select _user_id=auth.uid() and private.slim_session_security_allowed()
    and private.slim_workspace_access(_workspace_id,'admin');
$function$;
revoke all on function public.can_admin_workspace(uuid,uuid) from public,anon;
grant execute on function public.can_admin_workspace(uuid,uuid) to authenticated;

create function public.list_workspace_users(_workspace_id uuid)
returns table(id uuid,name text,email text)
language sql stable security definer set search_path = '' as $function$
  select m.user_id,coalesce(nullif(p.display_name,''),nullif(p.full_name,''),u.email::text,'Usuário'),u.email::text
  from public.workspace_members m
  left join public.profiles p on p.id=m.user_id
  left join auth.users u on u.id=m.user_id
  where m.workspace_id=_workspace_id
    and (m.access_expires_at is null or m.access_expires_at>now())
    and private.slim_session_security_allowed()
    and private.slim_workspace_access(_workspace_id,'member');
$function$;
revoke all on function public.list_workspace_users(uuid) from public,anon;
grant execute on function public.list_workspace_users(uuid) to authenticated;

create table public.team_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sector_id uuid references public.workflow_sectors(id) on delete cascade,
  from_user_id uuid references auth.users(id),
  to_user_id uuid references auth.users(id),
  body text not null check (length(body) between 1 and 4000),
  origin text not null default 'user' check (origin in ('user','salesbot')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_messages_target_check check ((sector_id is not null) <> (to_user_id is not null))
);
create index team_messages_sector_idx on public.team_messages(workspace_id,sector_id,created_at desc);
create index team_messages_dm_idx on public.team_messages(workspace_id,to_user_id,from_user_id,created_at desc);
alter table public.team_messages enable row level security;
revoke all on public.team_messages from public,anon,authenticated;
grant select,insert,delete on public.team_messages to authenticated;
grant update(read_at) on public.team_messages to authenticated;
grant all on public.team_messages to service_role;
create policy slim_team_read on public.team_messages for select to authenticated using (
  private.slim_workspace_access(workspace_id,'member') and (
    auth.uid() in (to_user_id,from_user_id) or (sector_id is not null and exists (
      select 1 from public.workflow_sectors s where s.id=sector_id and s.workspace_id=team_messages.workspace_id
        and (private.slim_workspace_access(s.workspace_id,'admin') or exists (
          select 1 from public.workflow_sector_members m where m.sector_id=s.id and m.user_id=auth.uid()
        ))
    ))
  )
);
create policy slim_team_send on public.team_messages for insert to authenticated with check (
  private.slim_workspace_access(workspace_id,'operator') and from_user_id=auth.uid() and origin='user' and (
    (to_user_id is not null and exists (
      select 1 from public.workspace_members m where m.workspace_id=team_messages.workspace_id and m.user_id=to_user_id
        and (m.access_expires_at is null or m.access_expires_at>now())
    )) or (sector_id is not null and exists (
      select 1 from public.workflow_sectors s where s.id=sector_id and s.workspace_id=team_messages.workspace_id
        and (private.slim_workspace_access(s.workspace_id,'admin') or exists (
          select 1 from public.workflow_sector_members m where m.sector_id=s.id and m.user_id=auth.uid()
        ))
    ))
  )
);
create policy slim_team_mark_read on public.team_messages for update to authenticated
  using (to_user_id=auth.uid() and private.slim_workspace_access(workspace_id,'member'))
  with check (to_user_id=auth.uid() and private.slim_workspace_access(workspace_id,'member'));
create policy slim_team_delete on public.team_messages for delete to authenticated
  using (from_user_id=auth.uid() and private.slim_workspace_access(workspace_id,'operator'));
create policy slim_session_security_required on public.team_messages as restrictive for all to authenticated
  using ((select private.slim_session_security_allowed())) with check ((select private.slim_session_security_allowed()));

create table public.team_chat_reads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  conversation_key text not null check (length(conversation_key) between 1 and 80),
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,workspace_id,conversation_key)
);
alter table public.team_chat_reads enable row level security;
revoke all on public.team_chat_reads from public,anon;
grant select,insert,update,delete on public.team_chat_reads to authenticated;
grant all on public.team_chat_reads to service_role;
create policy slim_team_own_reads on public.team_chat_reads for all to authenticated
  using (user_id=auth.uid() and private.slim_workspace_access(workspace_id,'member'))
  with check (user_id=auth.uid() and private.slim_workspace_access(workspace_id,'member'));
create policy slim_session_security_required on public.team_chat_reads as restrictive for all to authenticated
  using ((select private.slim_session_security_allowed())) with check ((select private.slim_session_security_allowed()));
