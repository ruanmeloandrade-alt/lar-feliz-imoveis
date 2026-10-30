-- Global Saúde Slim learning catalog. Exact verified account, not editable profile metadata.
create table public.tutorial_modules (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  position integer not null default 0 check (position between 0 and 1000000),
  created_at timestamptz not null default now()
);
create table public.tutorial_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.tutorial_modules(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  position integer not null default 0 check (position between 0 and 1000000),
  created_at timestamptz not null default now()
);
create index tutorial_lessons_module_position_idx on public.tutorial_lessons (module_id, position, id);
alter table public.tutorial_modules enable row level security;
alter table public.tutorial_lessons enable row level security;
revoke all on public.tutorial_modules, public.tutorial_lessons from public, anon, authenticated;
grant select, insert, update, delete on public.tutorial_modules, public.tutorial_lessons to authenticated;
grant all on public.tutorial_modules, public.tutorial_lessons to service_role;
create policy tutorials_read on public.tutorial_modules for select to authenticated using ((select auth.uid()) is not null);
create policy tutorials_read on public.tutorial_lessons for select to authenticated using ((select auth.uid()) is not null);
create policy tutorials_editor on public.tutorial_modules for all to authenticated
  using ((select auth.uid()) = 'e8f2252b-c0bc-4336-9912-2e62e73ddd2e'::uuid)
  with check ((select auth.uid()) = 'e8f2252b-c0bc-4336-9912-2e62e73ddd2e'::uuid);
create policy tutorials_editor on public.tutorial_lessons for all to authenticated
  using ((select auth.uid()) = 'e8f2252b-c0bc-4336-9912-2e62e73ddd2e'::uuid)
  with check ((select auth.uid()) = 'e8f2252b-c0bc-4336-9912-2e62e73ddd2e'::uuid);
