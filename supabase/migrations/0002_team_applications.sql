-- maNOWj GeoIntel: team applications
-- Run this against your Supabase project after 0001_init.sql (SQL Editor,
-- or `supabase db push`). Adds the "Join Our Team" application form's
-- storage, using the same anonymous/service-role-only pattern as kb_documents and
-- feedback in 0001_init.sql.

create table if not exists team_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  interest text not null default 'other',
  message text,
  created_at timestamptz not null default now()
);

create index if not exists team_applications_created_at_idx on team_applications (created_at desc);

alter table team_applications enable row level security;
-- No public policies on purpose: written only via api/team-apply.ts using
-- the service-role key, which bypasses RLS by design. RLS stays enabled as
-- defense in depth, same reasoning as every other table in this project.
