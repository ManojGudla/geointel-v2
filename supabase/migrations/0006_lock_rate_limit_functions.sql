-- maNOWj GeoIntel: lock the rate-limit functions to the server.
--
-- Run this against your Supabase project after 0005_rate_limits.sql (SQL
-- Editor, paste and run). Safe to run more than once.
--
-- Postgres lets every role execute a new function unless told otherwise, and
-- Supabase exposes public functions over its REST API. So anyone holding this
-- project's URL and anon key could call check_rate_limit to reset or inflate
-- the counters that protect the AI and admin endpoints, or call
-- prune_rate_limits to wipe them. The app itself never sends either value to
-- the browser, which is why this was never exploitable from the live site,
-- but nothing in the database enforced that.
--
-- Only the server, which connects with the service-role key, needs them. If
-- anything here is ever wrong, the API does not break: api/_lib/rateLimit.ts
-- falls back to its in-memory limiter whenever the database call fails.

revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.prune_rate_limits() from public, anon, authenticated;

grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.prune_rate_limits() to service_role;
