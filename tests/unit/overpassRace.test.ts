import { describe, expect, it, vi, afterEach } from "vitest";
import { runOverpassQuery } from "../../api/_lib/overpass";

/**
 * Regression coverage for the bug the user hit in production: "Property
 * intelligence failed to load ... timed out after 15s" even though the data
 * was reachable. Root cause was runOverpassQuery trying its 3 public
 * mirrors one at a time at 20s each (worst case ~60s) while the frontend's
 * own request timeout was 15s. The fix races all mirrors in parallel so the
 * response time is bounded by the fastest attempt, not the sum of all of
 * them — these tests assert that behavior directly rather than just the
 * end-to-end symptom.
 */
// A real Overpass response always carries a genuine osm3s replica
// timestamp (see api/_lib/overpass.ts's hasPlausibleReplicaTimestamp,
// added after a live mirror was found returning HTTP 200 with a
// well-formed but empty body backed by a corrupted replica) — these
// fixtures include one so they still look like a real mirror's response.
const FAKE_OSM3S = { timestamp_osm_base: "2026-08-31T00:00:00Z" };

describe("runOverpassQuery mirror racing", () => {
  afterEach(() => vi.useRealTimers());

  it("resolves via a fast mirror without waiting out a slow/failing one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("overpass-api.de")) {
          // Simulates the real-world case: the primary mirror is slow/degraded.
          await new Promise((r) => setTimeout(r, 12_000));
          return { ok: false, status: 504, text: async () => "" };
        }
        if (url.includes("kumi.systems")) {
          await new Promise((r) => setTimeout(r, 500));
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ elements: [{ type: "node", id: 1, lat: 1, lon: 2, tags: {} }], osm3s: FAKE_OSM3S }),
          };
        }
        await new Promise((r) => setTimeout(r, 5000));
        return { ok: false, status: 500, text: async () => "" };
      })
    );

    const start = Date.now();
    const promise = runOverpassQuery("[out:json];out;");
    await vi.advanceTimersByTimeAsync(1000); // only the fast mirror's 500ms should be needed
    const elements = await promise;
    const elapsedMs = Date.now() - start;

    expect(elements).toEqual([{ type: "node", id: 1, lat: 1, lon: 2, tags: {} }]);
    // Comfortably under the 15s client-side timeout this bug used to blow past.
    expect(elapsedMs).toBeLessThan(15_000);

    vi.unstubAllGlobals();
  });

  it("still throws a descriptive error when every mirror genuinely fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 502, text: async () => "" }))
    );

    await expect(runOverpassQuery("[out:json];out;")).rejects.toThrow(/returned HTTP 502/);

    vi.unstubAllGlobals();
  });

  /**
   * Regression coverage for a second, subtler symptom the user hit:
   * click-to-inspect confidently reporting "VACANT / UNKNOWN, 0 features"
   * for a spot that's clearly built up in the satellite view. A mirror
   * under load can return HTTP 200 with elements:[] plus a "remark" field
   * (Overpass's own signal that the query didn't actually finish) — treating
   * that as a trustworthy empty result would misreport "confirmed nothing
   * here" when the truth is "the query never really ran." One degraded
   * mirror shouldn't sink the whole request when another mirror has real
   * data, so this asserts the race still finds it.
   */
  it("rejects an empty result with a remark (degraded response) and uses a real result from another mirror instead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("overpass-api.de")) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ elements: [], remark: "runtime error: Query timed out in \"query\" at line 1" }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ elements: [{ type: "node", id: 42, lat: 1, lon: 2, tags: { amenity: "restaurant" } }], osm3s: FAKE_OSM3S }),
        };
      })
    );

    const elements = await runOverpassQuery("[out:json];out;");
    expect(elements).toEqual([{ type: "node", id: 42, lat: 1, lon: 2, tags: { amenity: "restaurant" } }]);

    vi.unstubAllGlobals();
  });

  it("still returns elements when a remark is present but the mirror did return real data (not discarded just for carrying a remark)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            elements: [{ type: "node", id: 7, lat: 1, lon: 2, tags: { shop: "convenience" } }],
            remark: "some elements may be incomplete",
            osm3s: FAKE_OSM3S,
          }),
      }))
    );

    const elements = await runOverpassQuery("[out:json];out;");
    expect(elements).toEqual([{ type: "node", id: 7, lat: 1, lon: 2, tags: { shop: "convenience" } }]);

    vi.unstubAllGlobals();
  });

  /**
   * Regression coverage for a live bug found 2026-09-01: a public mirror can
   * return HTTP 200, a well-formed `{elements:[...]}` body, and NO `remark`
   * — but its own `osm3s.timestamp_osm_base` is garbage (a corrupted/near-
   * empty replica, not a real date), and `elements` is empty even for a
   * real, densely-mapped location. The old `Promise.any` race took whatever
   * settled first, so this corrupted-but-fast mirror could "win" over a
   * slower mirror that had real data — a confident, silent false negative.
   * A real mirror with valid data must win instead.
   */
  it("ignores a mirror with a bogus replica timestamp (corrupted/empty replica) even though it answers fast with a well-formed empty body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("osm.ch")) {
          // The exact live shape observed: 200, valid JSON, empty elements,
          // no remark, but a non-date "timestamp" — answers almost instantly.
          return { ok: true, status: 200, text: async () => JSON.stringify({ elements: [], osm3s: { timestamp_osm_base: "116813" } }) };
        }
        if (url.includes("kumi.systems")) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ elements: [{ type: "node", id: 5, lat: 1, lon: 2, tags: { building: "yes" } }], osm3s: FAKE_OSM3S }),
          };
        }
        return { ok: false, status: 502, text: async () => "" };
      })
    );

    const elements = await runOverpassQuery("[out:json];out;");
    expect(elements).toEqual([{ type: "node", id: 5, lat: 1, lon: 2, tags: { building: "yes" } }]);

    vi.unstubAllGlobals();
  });

  /**
   * Regression coverage for a live production issue: GIS evidence for a
   * location succeeded while click-to-inspect for a point inside it reported
   * every mirror failing, seconds apart. The cause was self-inflicted load —
   * each query fired all six mirrors at once, and one map interaction runs
   * several queries concurrently, so a single click meant 12-24 simultaneous
   * requests to free public infrastructure from one IP, which throttles per
   * IP. These two tests pin the hedging behaviour that fixes it: contact two
   * mirrors normally, all six only when needed.
   */
  it("contacts only the first wave when a healthy mirror answers, rather than hitting all six every time", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ elements: [{ type: "node", id: 1, lat: 1, lon: 2, tags: {} }], osm3s: FAKE_OSM3S }),
        };
      })
    );

    const elements = await runOverpassQuery("[out:json];out;");

    expect(elements).toHaveLength(1);
    // The load reduction IS the fix — assert it directly.
    expect(calls.length).toBeLessThanOrEqual(2);

    vi.unstubAllGlobals();
  });

  it("escalates to every remaining mirror immediately when a wave fails, without waiting out the hedge delay", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: false, status: 502, text: async () => "" };
      })
    );

    const start = Date.now();
    await expect(runOverpassQuery("[out:json];out;")).rejects.toThrow(/All Overpass mirrors failed/);

    // Full coverage is preserved for the degraded case...
    expect(calls).toHaveLength(6);
    // ...and a dead wave escalates at once rather than costing 2.5s per wave.
    expect(Date.now() - start).toBeLessThan(2_000);

    vi.unstubAllGlobals();
  });

  /**
   * Regression coverage for a live issue found 2026-09-01: when every mirror
   * fails, the combined error used to list generic, unattributed reasons
   * ("This operation was aborted" x2 with no endpoint) whenever the failure
   * was a raw network/timeout throw rather than an HTTP-status error — there
   * was no way to tell which of the 6 mirrors those came from. Every failure
   * reason in the combined error must now name its own endpoint.
   */
  it("names the endpoint even for a raw network failure that carries no endpoint in its own message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      })
    );

    await expect(runOverpassQuery("[out:json];out;")).rejects.toThrow(/overpass-api\.de.*: fetch failed/);

    vi.unstubAllGlobals();
  });

  it("still resolves to a genuinely empty result when every real mirror agrees there's nothing here", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ elements: [], osm3s: FAKE_OSM3S }),
      }))
    );

    const elements = await runOverpassQuery("[out:json];out;");
    expect(elements).toEqual([]);

    vi.unstubAllGlobals();
  });
});
