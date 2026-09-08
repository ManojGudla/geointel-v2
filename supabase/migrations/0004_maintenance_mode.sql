-- maNOWj GeoIntel — global maintenance mode (admin-controlled, real backend
-- enforcement, no redeploy needed to flip it).
-- Run this against your Supabase project after 0001-0003 (SQL Editor, or
-- `supabase db push`).
--
-- app_settings is a single-row table (id is fixed to 1, enforced by the
-- check constraint below) holding the one global maintenance flag and its
-- display text. api/_lib/maintenance.ts reads it (short-TTL cached) on
-- every public API request and from the App.tsx polling loop; api/admin/
-- maintenance.ts is the only thing that ever writes it, and only after
-- verifying the GEOINTEL_ADMIN_KEY header — see api/_lib/adminAuth.ts.
--
-- Same RLS pattern as every other table in this project: enabled, no public
-- policies, so only the service-role key (server-side only) can read or
-- write it — the browser's anon key can never see or change this directly.

create table if not exists app_settings (
  id smallint primary key default 1,
  maintenance_mode boolean not null default false,
  maintenance_type text not null default 'scheduled' check (maintenance_type in ('scheduled', 'emergency')),
  maintenance_title text,
  maintenance_message text,
  maintenance_estimated_end text,
  maintenance_support_info text,
  maintenance_show_status boolean not null default true,
  maintenance_show_countdown boolean not null default false,
  maintenance_started_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

insert into app_settings (id) values (1) on conflict (id) do nothing;

alter table app_settings enable row level security;

-- Every enable/disable/settings-update action, for real accountability —
-- this project has no user-account system yet, so "Admin" is recorded by
-- admin_label, which the dashboard fills from whatever the admin has typed
-- into Settings → Display name (or "Admin" if they haven't set one). Never
-- a fabricated or guessed identity.
create table if not exists maintenance_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('enabled', 'disabled', 'settings_updated')),
  maintenance_type text,
  admin_label text,
  created_at timestamptz not null default now()
);

create index if not exists maintenance_audit_log_created_at_idx on maintenance_audit_log (created_at desc);

alter table maintenance_audit_log enable row level security;
