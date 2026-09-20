-- maNOWj GeoIntel: initial schema
-- Run this against your Supabase project (SQL Editor, or `supabase db push`
-- if you use the CLI). Both tables reserve a nullable `user_id` so real
-- accounts can be added later without a migration rewrite. Everything here
-- is anonymous and device-scoped for now.

-- ---------------------------------------------------------------------------
-- kb_documents: product/domain knowledge base retrieved by the AI Copilot
-- and agents via Postgres full-text search (RAG without an embeddings bill).
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

create table if not exists kb_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  tags text[] not null default '{}',
  user_id uuid,
  created_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) stored
);

create index if not exists kb_documents_search_idx on kb_documents using gin (search_vector);

alter table kb_documents enable row level security;
-- No public policies are defined on purpose: this table is only ever
-- read/written by api/*.ts handlers using the service-role key, which
-- bypasses RLS by design. RLS stays enabled as defense in depth in case the
-- anon key is ever used against this table by mistake.

-- ---------------------------------------------------------------------------
-- feedback: star ratings + comments, keyed by the anonymous device id
-- already used elsewhere in the app (src/services/deviceId.ts).
-- ---------------------------------------------------------------------------
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  user_id uuid,
  rating smallint not null check (rating between 1 and 5),
  category text not null default 'general',
  message text,
  page_context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on feedback (created_at desc);

alter table feedback enable row level security;
-- Same reasoning as kb_documents: writes/reads happen only via the
-- service-role key in api/feedback.ts, never directly from the browser.
