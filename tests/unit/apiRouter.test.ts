import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTES, routeKeyFromUrl } from "../../api/_routes";
import catchAll from "../../api/[...path]";
import { fakeReqRes } from "./testUtils";

/**
 * The whole API is now served by one Vercel serverless function
 * (api/[...path].ts) dispatching through the ROUTES table, because Vercel's
 * Hobby plan caps a deployment at 12 functions and this project has 17
 * endpoints - deploying them as separate files failed outright, which is why
 * the live site had a frontend and no API. That makes this router the single
 * point of failure for every endpoint, so it gets direct coverage: a wrong
 * key here silently 404s a whole feature in production.
 */
describe("API router", () => {
  it("maps a plain URL to its route key", () => {
    expect(routeKeyFromUrl("/api/nearby")).toBe("nearby");
  });

  it("ignores the query string when resolving a route", () => {
    expect(routeKeyFromUrl("/api/nearby?lat=43.07&lon=-76.16&radius=1000")).toBe("nearby");
  });

  it("resolves nested routes, not just top-level ones", () => {
    expect(routeKeyFromUrl("/api/ai/copilot")).toBe("ai/copilot");
    expect(routeKeyFromUrl("/api/admin/maintenance?x=1")).toBe("admin/maintenance");
  });

  it("tolerates a trailing slash", () => {
    expect(routeKeyFromUrl("/api/gis/")).toBe("gis");
  });

  // Every endpoint the frontend calls must be registered. If a handler is
  // added under api/_routes/ but never listed in ROUTES, it exists on disk,
  // typechecks, and still 404s at runtime - this is the check that catches
  // that before a deploy does.
  it("registers every endpoint the app depends on, each as a callable handler", () => {
    const expected = [
      "buildings",
      "feedback",
      "geocode",
      "gis",
      "health",
      "imagery",
      "live",
      "nearby",
      "news",
      "officials",
      "poi-evidence",
      "population",
      "reverse-geocode",
      "route",
      "site",
      "status",
      "team-apply",
      "weather",
      "ai-intent",
      "ai/agent",
      "ai/copilot",
      "admin/maintenance",
      "admin/submissions",
    ];
    expect(Object.keys(ROUTES).sort()).toEqual(expected.sort());
    for (const [key, handler] of Object.entries(ROUTES)) {
      expect(typeof handler, `route "${key}" should be a function`).toBe("function");
    }
  });

  /**
   * Regression coverage for a production-only 404: Vercel's plain api/
   * directory matches `[...path]` against exactly ONE segment, so the
   * catch-all served /api/health while /api/ai/copilot and
   * /api/admin/maintenance returned 404 - the admin page was unreachable
   * even though its handler was registered and working. Nested routes need a
   * real file at their own path. Nothing in the source makes that visible,
   * so without this test the next nested route added would 404 in production
   * while passing every check locally.
   */
  it("gives every nested route its own Vercel entry file, since [...path] only matches one segment", () => {
    const nested = Object.keys(ROUTES).filter((key) => key.includes("/"));
    expect(nested.length).toBeGreaterThan(0);

    for (const key of nested) {
      const entry = path.resolve(process.cwd(), "api", `${key}.ts`);
      expect(existsSync(entry), `Missing api/${key}.ts - /api/${key} would 404 in production despite being in ROUTES`).toBe(true);
    }
  });

  it("dispatches a real request to the matching handler", async () => {
    const result = fakeReqRes({});
    result.req.url = "/api/health";
    result.req.method = "GET";

    await catchAll(result.req, result.res);

    expect(result.statusCode).toBe(200);
    expect((result.body as { ok: boolean }).ok).toBe(true);
  });

  it("returns a 404 with a NOT_FOUND code for an unknown route rather than throwing", async () => {
    const result = fakeReqRes({});
    result.req.url = "/api/not-a-real-endpoint";
    result.req.method = "GET";

    await catchAll(result.req, result.res);

    expect(result.statusCode).toBe(404);
    expect((result.body as { code: string }).code).toBe("NOT_FOUND");
  });
});
