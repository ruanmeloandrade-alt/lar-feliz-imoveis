begin;

-- Keep the existing administrator predicate away from unauthenticated reads.
alter policy "Anyone can view published properties" on public.properties
  to authenticated;

create policy "Visitors can view published properties"
  on public.properties for select to anon
  using (published = true);

commit;
