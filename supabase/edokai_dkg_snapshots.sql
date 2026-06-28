-- Edokai live DKG Supabase schema
-- Project: https://supabase.com/dashboard/project/lfnpcgcxezyjcgnpcagq
-- Run this once in Supabase SQL Editor, then set Netlify/Hermes env vars documented in docs/supabase-live-dkg.md.

create table if not exists public.edokai_dkg_snapshots (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  source text not null default 'hermes'
);

grant select on table public.edokai_dkg_snapshots to anon;
grant select on table public.edokai_dkg_snapshots to authenticated;
grant select, insert, update, delete on table public.edokai_dkg_snapshots to service_role;

alter table public.edokai_dkg_snapshots enable row level security;

-- Public read is OK: the frontend only needs the anon key and the DKG contains public/source-grounded learning content.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'edokai_dkg_snapshots'
      and policyname = 'edokai dkg snapshots are publicly readable'
  ) then
    create policy "edokai dkg snapshots are publicly readable"
      on public.edokai_dkg_snapshots
      for select
      using (true);
  end if;
end $$;

-- Writes should use the Supabase service-role key from local Hermes only.
-- Do not expose the service-role key to Netlify client code.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'edokai_dkg_snapshots'
  ) then
    alter publication supabase_realtime add table public.edokai_dkg_snapshots;
  end if;
end $$;

insert into public.edokai_dkg_snapshots (id, payload, source)
values ('latest', '{"dkg":{"schema_version":1,"sources":{},"nodes":{},"edges":[]},"conceptWorldIndex":{"schema_version":1,"macro_worlds":{}}}'::jsonb, 'bootstrap')
on conflict (id) do nothing;
