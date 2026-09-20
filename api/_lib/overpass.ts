import { fetchWithTimeout } from "./cache.js";

// Multiple public mirrors, RACED in parallel (see runOverpassQuery below) -
// the same failover pattern proven in the previous version of this
// project. Overpass's public instances are free but occasionally
// rate-limit or go dark individually, especially for a shared/dev-machine
// IP that's made a lot of requests in a short window - that's a real
// operational risk for a free public API, not a code bug, and the fix on
// this side is exactly what's here: more independent mirrors racing in
// parallel so one instance rate-limiting this deployment doesn't take
// every GIS-dependent feature (Evidence, Property Intelligence, click-to-
// inspect, Nearby, the GIS layers, and by extension every AI agent that
// reasons over that data) down with it. Two more well-known public
// instances added here for exactly that redundancy.
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  /** Present when the query uses `out geom` - the way's full node ring, for building footprints etc. */
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

const OVERPASS_ENDPOINT_TIMEOUT_MS = 14_000;

// Mirrors are contacted in waves rather than all at once - a "hedged
// request". Reported bug: on the live site, GIS evidence for a location
// succeeded while click-to-inspect for a point inside it reported every
// mirror failing, seconds apart. The cause is load we were generating
// ourselves: each runOverpassQuery fired all six mirrors simultaneously, and
// a single map interaction runs several of these queries at once (/api/gis,
// /api/poi-evidence, /api/nearby, /api/buildings) - so one click meant
// 12-24 concurrent requests hitting free, volunteer-run public
// infrastructure from a single deployment IP. Mirrors throttle per IP, so
// our own queries were starving each other.
//
// Two at a time, escalating only when they don't deliver, cuts steady-state
// load roughly threefold while keeping the full six-mirror coverage for the
// degraded case. A wave that fails outright escalates immediately (see
// launchWave); only genuinely slow mirrors cost the delay. It's also what
// Overpass's usage policy asks of clients, which matters for a free service
// this app depends on for Evidence, Nearby, click-to-inspect, Property
// Intelligence and every AI agent reasoning over them.
const HEDGE_WAVE_SIZE = 2;
const HEDGE_DELAY_MS = 2_500;

/**
 * Overpass's usage policy asks every client to identify itself, and this was
 * the one external client here that didn't - api/_lib/nominatim.ts and
 * api/_lib/wikidata.ts have always sent one.
 *
 * That gap only became visible in production. From a home IP the mirrors
 * mostly tolerated an anonymous request; from Vercel's datacenter IPs,
 * overpass-api.de answered HTTP 406 Not Acceptable - the signature of a WAF
 * refusing a request rather than a real content-negotiation failure, since
 * the query and Accept header were unchanged from the ones that work
 * locally. An unidentified client from a cloud IP is exactly what those
 * rules target. Identifying ourselves is also just the courteous thing to
 * do with a free service this project leans on for Evidence, Nearby,
 * click-to-inspect, Property Intelligence and every AI agent downstream of
 * them.
 */
const USER_AGENT = "maNOWj-GeoIntel/2.0 (location-intelligence app; contact: geointel app)";

/**
 * A public mirror's own OSM3S replica timestamp - a real one always looks
 * like "2026-08-31T12:00:00Z". Verified live against several public mirrors
 * (2026-09-01): one otherwise-healthy-looking instance (overpass.osm.ch)
 * returned HTTP 200, a well-formed `{elements:[...]}` body, and NO `remark`
 * - but `osm3s.timestamp_osm_base` was a tiny sequence number ("116813"),
 * not a date, and `elements` was empty for a real, densely-built US
 * address. That mirror's data replica is corrupted/near-empty, not "this
 * spot has nothing" - the exact silent-false-negative this project has
 * chased before (the "Overpass coming back empty for a real location" bug).
 * A `remark` field only covers a mid-query load-shed; it says nothing about
 * a replica that's just broken and returns confident, well-formed garbage.
 * This is the second, independent guard against that: reject a response
 * whose own timestamp doesn't look like a real date, same as any other
 * mirror failure.
 */
function hasPlausibleReplicaTimestamp(data: { osm3s?: { timestamp_osm_base?: string } }): boolean {
  const ts = data.osm3s?.timestamp_osm_base;
  return typeof ts === "string" && /^\d{4}-\d{2}-\d{2}T/.test(ts);
}

interface MirrorOutcome {
  endpoint: string;
  ok: boolean;
  elements?: OverpassElement[];
  error?: string;
}

/**
 * Races every mirror in PARALLEL rather than trying them one at a time.
 *
 * The previous version awaited each endpoint in sequence at a 20s timeout -
 * so if the first (most commonly overloaded) public instance was slow, the
 * request could still be waiting on it 40-60s later while the frontend's
 * own 15s client-side timeout (apiClient.ts) had already given up and shown
 * "timed out after 15s." Firing all mirrors at once and taking whichever
 * succeeds first bounds the wait to the slowest SINGLE attempt instead of
 * the sum of all of them, which is what actually fixes that symptom rather
 * than just moving the number around.
 *
 * This used to be a plain `Promise.any` - first mirror to settle wins,
 * full stop. That's wrong for Overpass specifically: an unhealthy mirror
 * (corrupted/near-empty replica, or one that fails fast) can "win" the
 * race against a slower mirror that was about to return real data, and
 * the caller has no way to tell "confirmed nothing here" apart from "the
 * mirror that answered first happened to be a bad one." So this now takes
 * the FIRST mirror that returns real (non-empty) elements as soon as it
 * arrives - same latency as before on the common case - but a mirror that
 * comes back empty no longer short-circuits the race; it only counts once
 * every mirror has had its chance, and only if no mirror anywhere found
 * anything real.
 */
export async function runOverpassQuery(query: string): Promise<OverpassElement[]> {
  const outcomes: MirrorOutcome[] = [];

  return new Promise<OverpassElement[]>((resolve, reject) => {
    let settledCount = 0;
    let decided = false;
    let launched = 0;
    let waveTimer: ReturnType<typeof setTimeout> | undefined;

    const stopEscalating = () => {
      if (waveTimer) clearTimeout(waveTimer);
      waveTimer = undefined;
    };

    const finish = () => {
      stopEscalating();
      if (decided) return;
      // Every mirror has now reported in. Prefer any real result over an
      // empty one - several mirrors can be empty while one further down
      // the list found something - then fall back to a genuine "every
      // mirror agreed there's nothing here," and only throw if literally
      // every mirror failed outright.
      const nonEmpty = outcomes.find((o) => o.ok && o.elements && o.elements.length > 0);
      if (nonEmpty) {
        decided = true;
        return resolve(nonEmpty.elements!);
      }
      const anyEmpty = outcomes.find((o) => o.ok);
      if (anyEmpty) {
        decided = true;
        return resolve(anyEmpty.elements!);
      }
      decided = true;
      const errors = outcomes.map((o) => o.error).filter((e): e is string => !!e);
      /*
        Logged in full, reported in summary.

        `errors` holds one entry per mirror, each naming the mirror's URL and
        the HTTP status it returned, and that string was travelling all the
        way into the 502 body that the browser renders. It told any visitor
        which third-party endpoints this app depends on and exactly how they
        were failing, which is reconnaissance handed over for free and is of
        no use whatsoever to the person reading it.

        The detail still goes to the server log, where it is genuinely needed
        for debugging. What crosses the wire is the count.
      */
      console.error("[overpass] all mirrors failed:", errors.join(" | "));
      reject(
        new Error(
          errors.length
            ? `All ${errors.length} OpenStreetMap data mirrors failed to respond.`
            : "All OpenStreetMap data mirrors failed to respond."
        )
      );
    };

    const attempt = (endpoint: string) => {
      (async () => {
        try {
          const response = await fetchWithTimeout(
            endpoint,
            {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=UTF-8", Accept: "application/json", "User-Agent": USER_AGENT },
              body: query,
            },
            OVERPASS_ENDPOINT_TIMEOUT_MS
          );

          if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}`);

          const text = await response.text();
          if (!text.trim()) throw new Error(`${endpoint} returned an empty response`);

          const data = JSON.parse(text) as { elements?: OverpassElement[]; remark?: string; osm3s?: { timestamp_osm_base?: string } };
          if (!Array.isArray(data.elements)) throw new Error(`${endpoint} returned no usable elements`);

          // A 200 response with a "remark" (Overpass's own way of flagging a
          // degraded response - typically a server-side timeout or load-shed
          // mid-query) can still carry elements:[] even in a densely-mapped
          // area. Treating that as a confident "nothing here" would be wrong -
          // it means the query didn't actually finish, not that OSM has no
          // data. Only reject on an EMPTY result with a remark; a remark
          // alongside real elements just means "possibly incomplete," which is
          // still more useful than discarding it entirely.
          if (data.remark && data.elements.length === 0) {
            throw new Error(`${endpoint} returned a degraded response: ${data.remark}`);
          }

          if (!hasPlausibleReplicaTimestamp(data)) {
            throw new Error(`${endpoint} returned a response with no valid replica timestamp, likely a corrupted/empty mirror`);
          }

          outcomes.push({ endpoint, ok: true, elements: data.elements });
          if (data.elements.length > 0 && !decided) {
            decided = true;
            // Real data in hand - don't send the later waves at all. This is
            // the whole point of hedging: on a healthy request the mirrors
            // further down the list are never contacted.
            stopEscalating();
            resolve(data.elements);
          }
        } catch (error) {
          // Every error thrown INSIDE this try already mentions its own
          // endpoint (e.g. "${endpoint} returned HTTP 502") - but a raw
          // fetchWithTimeout failure (a network-level throw, or the
          // AbortController firing at OVERPASS_ENDPOINT_TIMEOUT_MS) surfaces
          // its own generic message ("fetch failed", "This operation was
          // aborted") with no indication of which of the 6 mirrors it came
          // from. Reported bug: the GIS Evidence panel's error list showed
          // two identical, unattributed "This operation was aborted" lines
          // when every mirror failed at once - no way to tell which mirrors
          // those were, which matters when diagnosing a live, partial
          // outage. Only prefix when the message doesn't already name this
          // endpoint, so the already-descriptive messages aren't doubled up.
          const raw = error instanceof Error ? error.message : "request failed";
          const message = raw.includes(endpoint) ? raw : `${endpoint}: ${raw}`;
          outcomes.push({ endpoint, ok: false, error: message });
        } finally {
          settledCount += 1;
          if (settledCount === OVERPASS_ENDPOINTS.length) {
            finish();
          } else if (settledCount === launched && !decided) {
            // Everything launched so far has failed, and there are mirrors
            // left to try - escalate immediately rather than waiting out the
            // hedge delay. Slow mirrors get the delay; dead ones don't.
            launchWave();
          }
        }
      })();
    };

    function launchWave() {
      if (decided || launched >= OVERPASS_ENDPOINTS.length) return;
      stopEscalating();
      const wave = OVERPASS_ENDPOINTS.slice(launched, launched + HEDGE_WAVE_SIZE);
      launched += wave.length;
      wave.forEach(attempt);
      if (launched < OVERPASS_ENDPOINTS.length) {
        waveTimer = setTimeout(launchWave, HEDGE_DELAY_MS);
      }
    }

    launchWave();
  });
}

/**
 * Builds an Overpass QL query for every tag group we care about within a
 * radius, in a single request (cheaper and faster than one request per
 * category).
 */
export function buildEvidenceQuery(lat: number, lon: number, radiusMeters: number): string {
  const filters = [
    "[building]",
    "[shop]",
    "[office]",
    "[amenity]",
    "[landuse]",
    "[industrial]",
    "[tourism]",
    "[leisure=park]",
    "[natural=water]",
    "[waterway]",
    "[railway]",
    "[highway=bus_stop]",
    "[public_transport]",
    "[amenity=hospital]",
    "[amenity=school]",
    "[amenity=college]",
    "[amenity=university]",
    "[amenity=bank]",
    "[amenity=atm]",
    "[amenity=pharmacy]",
    "[amenity=police]",
    "[amenity=fuel]",
    "[amenity=parking]",
    "[tourism=hotel]",
    "[boundary=administrative]",
  ];

  const clauses = filters.map((f) => `nwr(around:${radiusMeters},${lat},${lon})${f};`).join("\n    ");

  return `
    [out:json][timeout:25];
    (
    ${clauses}
    );
    out center tags;
  `;
}

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Building footprints (full polygon geometry, not just a center point) for
 * one screen's worth of map - powers the 3D extrusion view. A different,
 * heavier query shape than buildEvidenceQuery above (`out geom` instead of
 * `out center`), so it's kept separate and only ever called for a bounded,
 * size-checked viewport (see api/buildings.ts).
 */
export function buildBuildingGeometryQuery(bbox: Bbox): string {
  return `
    [out:json][timeout:25];
    (
      way[building](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out geom;
  `;
}

export function normalizeElement(el: OverpassElement): { lat: number; lon: number } | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  return { lat, lon };
}
