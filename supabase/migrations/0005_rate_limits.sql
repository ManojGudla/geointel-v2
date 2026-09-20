-- A rate limiter that survives a cold start.
--
-- The one this replaces lived in a JavaScript Map inside the running function
-- (api/_lib/cache.ts). On Vercel that is per-instance and per-cold-start: two
-- requests arriving at once are handled by two processes, each with its own
-- empty counter, and every new instance hands the caller a fresh budget. The
-- file said so in a comment and treated it as acceptable. It was not, in one
-- place in particular: GET /api/admin/maintenance answers "is this admin key
-- correct?" for any key sent to it, and that in-memory counter was the only
-- thing between an attacker and guessing it at whatever rate they liked.
--
-- Deliberately NOT used on the geographic routes. Those are edge-cached, they
-- are called constantly, and adding a database round trip to each one would
-- cost every visitor latency to defend against upstream abuse that the edge
-- cache already absorbs. This table guards the two things where being wrong
-- is expensive: the admin key, and the AI endpoints that spend real money.

create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

-- Old rows are dead weight; nothing reads a window that has expired.
create index if not exists rate_limits_reset_at_idx on rate_limits (reset_at);

alter table rate_limits enable row level security;

-- One statement, so counting is atomic.
--
-- Read-then-write from the application would let two concurrent requests both
-- read count = 4, both decide they are under a limit of 5, and both write 5 -
-- which is exactly the concurrency the in-memory version already lost to. The
-- insert-on-conflict below takes a row lock, so N simultaneous callers get N
-- distinct counts.
create or replace function check_rate_limit(p_key text, p_window_ms integer, p_max integer)
returns table (allowed boolean, retry_after_ms integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_reset timestamptz;
begin
  insert into rate_limits as r (key, count, reset_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update
    set
      -- An expired window starts over at 1 rather than continuing to climb.
      count = case when r.reset_at <= v_now then 1 else r.count + 1 end,
      reset_at = case when r.reset_at <= v_now then v_now + make_interval(secs => p_window_ms / 1000.0) else r.reset_at end
  returning r.count, r.reset_at into v_count, v_reset;

  return query
    select
      v_count <= p_max,
      greatest(0, extract(epoch from (v_reset - v_now)) * 1000)::integer;
end;
$$;

-- Housekeeping. Safe to call from anywhere; there is no scheduler configured,
-- so the API calls it occasionally rather than relying on cron.
create or replace function prune_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limits where reset_at < now() - interval '1 hour';
$$;
