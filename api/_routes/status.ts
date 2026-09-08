import type { ApiHandler } from "../_lib/http.js";
import { ok, err, getClientIp } from "../_lib/http.js";
import { TtlCache, RateLimiter, fetchWithTimeout, withTimeout } from "../_lib/cache.js";
import { OVERPASS_ENDPOINTS } from "../_lib/overpass.js";
import { getSupabaseClient } from "../_lib/supabase.js";

/**
 * Live health of every external service this app depends on.
 *
 * Why this exists: this project's failure modes are almost entirely other
 * people's infrastructure — six free Overpass mirrors, Nominatim, Wikidata,
 * OpenRouter, Supabase. When something breaks, the app degrades honestly but
 * gives no way to see WHICH dependency is at fault without reading server
 * logs. That's tolerable for one developer and not tolerable for a tool a
 * team uses daily: "GIS evidence is unavailable" should be answerable in one
 * glance, not a debugging session.
 *
 * Every check here is a REAL probe with a real measured latency. Nothing is
 * assumed healthy, and nothing reports green because a key happens to be
 * present — the one exception is documented on the OpenRouter check below,
 * and it reports "configured" rather than "operational" precisely so it
 * isn't mistaken for a liveness result.
 */

interface DependencyStatus {
  /** Stable id for the UI. */
  id: string;
  /** Human label. */
  name: string;
  /** What breaks in the app when this is down. */
  affects: string;
  status: "operational" | "degraded" | "down" | "not_configured";
  /** Round-trip time in ms for the probe, when one ran. */
  latencyMs: number | null;
  detail: string;
}

// Probing is itself load on free infrastructure, so results are cached and
// every probe is tightly bounded. A minute is short enough to be useful when
// something is actively breaking, long enough that an open status page (or a
// few of them) can't become a load source of its own.
const cache = new TtlCache<{ dependencies: DependencyStatus[]; checkedAt: string }>(60 * 1000);
const limiter = new RateLimiter(60_000, 30);
// Probes run in parallel, so the page is as slow as the slowest one — and a
// dead mirror burns the whole budget before failing. The first live run took
// 5.1s because three mirrors timed out. 3.5s still gives a genuinely slow but
// alive service room to answer, while keeping the page quick during exactly
// the outage you'd be loading it to investigate.
const PROBE_TIMEOUT_MS = 3_500;
const CACHE_KEY = "status";

const USER_AGENT = "maNOWj-GeoIntel/2.0 (status check; contact: geointel app)";

/** Times a probe and converts any throw into a "down" result — a status page must never itself 500. */
async function probe(
  id: string,
  name: string,
  affects: string,
  run: () => Promise<{ status: DependencyStatus["status"]; detail: string }>
): Promise<DependencyStatus> {
  const started = Date.now();
  try {
    const result = await run();
    return { id, name, affects, status: result.status, latencyMs: Date.now() - started, detail: result.detail };
  } catch (error) {
    return {
      id,
      name,
      affects,
      status: "down",
      latencyMs: Date.now() - started,
      detail: error instanceof Error ? error.message : "Probe failed",
    };
  }
}

/**
 * Overpass mirrors are reported as ONE dependency with a count, because
 * that's how the app actually consumes them: queries race across mirrors, so
 * what matters is "how many are answering", not any single one. Their own
 * /api/status endpoint is used rather than a real query — it's what mirror
 * operators provide for exactly this purpose and costs them almost nothing.
 */
async function probeOverpass(): Promise<{ status: DependencyStatus["status"]; detail: string }> {
  const results = await Promise.all(
    OVERPASS_ENDPOINTS.map(async (endpoint) => {
      const statusUrl = endpoint.replace(/\/interpreter$/, "/status");
      try {
        const response = await fetchWithTimeout(statusUrl, { headers: { "User-Agent": USER_AGENT } }, PROBE_TIMEOUT_MS);
        return response.ok;
      } catch {
        return false;
      }
    })
  );

  const healthy = results.filter(Boolean).length;
  const total = results.length;
  const detail = `${healthy} of ${total} public mirrors responding`;

  // Thresholds are deliberately strict. The first live run of this page
  // reported "operational — 3 of 6 responding", which is a green light over
  // a real loss of half the redundancy this app depends on, and precisely
  // the kind of reassuring-but-wrong signal the rest of the project refuses
  // to emit. Losing half the mirrors is degraded: queries still succeed, but
  // they're slower and one more outage away from failing outright.
  if (healthy === 0) return { status: "down", detail: `${detail} — GIS evidence, Nearby and click-to-inspect will fail` };
  if (healthy * 2 <= total) return { status: "degraded", detail: `${detail} — reduced redundancy, expect slower or intermittent GIS results` };
  return { status: "operational", detail };
}

async function probeNominatim(): Promise<{ status: DependencyStatus["status"]; detail: string }> {
  const response = await fetchWithTimeout(
    "https://nominatim.openstreetmap.org/search?q=london&format=json&limit=1",
    { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
    PROBE_TIMEOUT_MS
  );
  if (!response.ok) return { status: "down", detail: `HTTP ${response.status}` };
  const rows = (await response.json()) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) return { status: "degraded", detail: "Responding but returned no results for a known query" };
  return { status: "operational", detail: "Search and reverse-geocoding responding" };
}

async function probeWikidata(): Promise<{ status: DependencyStatus["status"]; detail: string }> {
  const response = await fetchWithTimeout(
    "https://query.wikidata.org/sparql?query=" + encodeURIComponent("SELECT ?x WHERE { BIND(1 AS ?x) }") + "&format=json",
    { headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json" } },
    PROBE_TIMEOUT_MS
  );
  if (!response.ok) return { status: "down", detail: `HTTP ${response.status}` };
  return { status: "operational", detail: "Officeholder lookups responding" };
}

/**
 * Deliberately does NOT make a completion request. On OpenRouter's free tier
 * the whole app shares a 50-requests-per-day quota, so a status page that
 * generated a token every time it loaded would consume the very budget it's
 * reporting on — and would drain it fastest exactly when someone is anxiously
 * refreshing during an outage. /api/v1/models is a plain metadata read that
 * doesn't touch generation quota; it confirms the key is accepted and the
 * provider is reachable, which is what's actually diagnosable from here.
 */
async function probeOpenRouter(): Promise<{ status: DependencyStatus["status"]; detail: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { status: "not_configured", detail: "No OPENROUTER_API_KEY set — Copilot and all AI agents are unavailable" };
  }

  const response = await fetchWithTimeout(
    "https://openrouter.ai/api/v1/models",
    { headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": USER_AGENT } },
    PROBE_TIMEOUT_MS
  );

  if (response.status === 401 || response.status === 403) {
    return { status: "down", detail: "Provider rejected the configured API key" };
  }
  if (!response.ok) return { status: "degraded", detail: `Provider returned HTTP ${response.status}` };
  return { status: "operational", detail: "Key accepted and provider reachable (daily generation quota not checked)" };
}

async function probeSupabase(): Promise<{ status: DependencyStatus["status"]; detail: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { status: "not_configured", detail: "No Supabase credentials — knowledge base, feedback and maintenance mode are unavailable" };
  }
  const { error } = await withTimeout(client.from("app_settings").select("id").limit(1), PROBE_TIMEOUT_MS, "Supabase probe");
  // The message is logged, not returned. /api/status needs no auth, and a raw
  // PostgREST error names tables, roles and policies — and a DNS failure names
  // the Supabase project host. Everywhere else in this API errors are logged
  // and answered with a fixed string; this was the one place that wasn't.
  if (error) {
    console.error("[api/status] supabase probe", error.message);
    return { status: "down", detail: "Database not responding" };
  }
  return { status: "operational", detail: "Database responding" };
}

const handler: ApiHandler = async (req, res) => {
  const rate = limiter.check(getClientIp(req));
  if (!rate.allowed) {
    const cached = cache.get(CACHE_KEY);
    // Rate-limited callers still get the last known result rather than an
    // error — a status page that fails under load is worse than a stale one,
    // as long as it says how old the reading is.
    if (cached) return ok(res, { ...cached, stale: true });
    // Previously this branch fell through with no `else`, so a rate-limited
    // caller with a cold cache ran all ten upstream probes anyway. On
    // serverless the cache IS cold on every new instance, so that was the
    // normal path, not an edge case — one request in, ten out.
    return err(res, 429, "Too many status requests. Please slow down.", "RATE_LIMITED");
  }

  const cached = cache.get(CACHE_KEY);
  if (cached) return ok(res, { ...cached, stale: false });

  const dependencies = await Promise.all([
    probe("overpass", "OpenStreetMap Overpass", "GIS evidence, Nearby places, click-to-inspect, 3D buildings", probeOverpass),
    probe("nominatim", "Nominatim geocoding", "Location search and address lookup", probeNominatim),
    probe("wikidata", "Wikidata", "Official / Authority Intelligence", probeWikidata),
    probe("openrouter", "OpenRouter (AI)", "Copilot and the six AI agents", probeOpenRouter),
    probe("supabase", "Supabase", "Knowledge base, feedback, maintenance mode", probeSupabase),
  ]);

  const payload = { dependencies, checkedAt: new Date().toISOString() };
  cache.set(CACHE_KEY, payload);
  ok(res, { ...payload, stale: false });
};

export default handler;
