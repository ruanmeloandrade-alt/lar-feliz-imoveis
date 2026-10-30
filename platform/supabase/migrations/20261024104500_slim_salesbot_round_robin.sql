-- Restore the existing SalesBot distribution contract, with atomic allocation.
create table public.salesbot_round_robin_state (
  block_id uuid primary key references public.salesbot_blocks(id) on delete cascade,
  counter bigint not null default 0 check (counter >= 0),
  updated_at timestamptz not null default now()
);
alter table public.salesbot_round_robin_state enable row level security;
revoke all on public.salesbot_round_robin_state from public, anon, authenticated;
grant all on public.salesbot_round_robin_state to service_role;

create function public.salesbot_rr_next(_block_id uuid, _size integer)
returns integer language plpgsql security invoker set search_path = '' as $function$
declare v_counter bigint;
begin
  if _size is null or _size < 1 or _size > 1000 then
    raise exception 'invalid_distribution_size';
  end if;
  insert into public.salesbot_round_robin_state(block_id,counter)
  values (_block_id,1)
  on conflict(block_id) do update
    set counter=public.salesbot_round_robin_state.counter+1,updated_at=clock_timestamp()
  returning counter into v_counter;
  return ((v_counter-1) % _size)::integer;
end $function$;
revoke all on function public.salesbot_rr_next(uuid,integer) from public,anon,authenticated;
grant execute on function public.salesbot_rr_next(uuid,integer) to service_role;
