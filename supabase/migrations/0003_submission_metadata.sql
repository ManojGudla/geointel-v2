-- maNOWj GeoIntel - submission metadata (exact time + IP/user agent)
-- Run this against your Supabase project after 0001_init.sql and
-- 0002_team_applications.sql (SQL Editor, or `supabase db push`).
--
-- Every table that stores something a visitor submitted already records the
-- exact moment it happened via `created_at timestamptz not null default
-- now()` - that's a database-generated server-side timestamp, not a value
-- the client can spoof by sending a fake time. This migration adds the
-- "other details" half of that: the submitter's IP address and browser user
-- agent, for abuse investigation (e.g. spotting one IP mass-submitting
-- feedback) and basic diagnostics.
--
-- "Secure" here means the same thing every other table in this project
-- means by it: RLS is enabled with no public policies, so these columns are
-- only ever written or read via api/*.ts using the service-role key on the
-- server - the browser (anon key) can never see another visitor's IP or
-- user agent, and neither value is ever sent back to the frontend in any
-- API response.

alter table feedback add column if not exists ip_address text;
alter table feedback add column if not exists user_agent text;

alter table team_applications add column if not exists ip_address text;
alter table team_applications add column if not exists user_agent text;
