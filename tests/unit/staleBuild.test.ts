import { describe, expect, it } from "vitest";
import {
  RELOAD_GUARD_MS,
  isStaleBuildError,
  shouldReloadForStaleBuild,
} from "../../src/components/ErrorBoundary";

/**
 * Deploying while someone has the site open.
 *
 * Observed live on manowj.com: a deploy went out, and a tab that had been
 * open beforehand showed "maNOWj PLAY hit a problem and couldn't render" and
 * the same for the privacy panel. Nothing was wrong with the server — the
 * page in memory was naming chunk files that the new build had replaced, so
 * opening a not-yet-loaded panel fetched a URL that now 404s.
 *
 * Retry can never fix that: the file is gone, so re-rendering asks for the
 * same dead URL. Only a reload works. A normal visitor will not think to
 * reload; they read "hit a problem" as "this site is broken" and leave. So
 * the boundary reloads for them, once.
 *
 * Two things have to be right, and both are easy to get wrong in a way that
 * is much worse than the bug being fixed:
 *
 *   The match has to be narrow. Reloading on any error that mentions a failed
 *   fetch would reload the page every time a map tile is blocked.
 *
 *   The reload has to happen at most once. If the fresh build fails the same
 *   way, a second reload spins the tab forever and the visitor never sees a
 *   message at all.
 */

describe("recognising a stale build", () => {
  it("matches what each browser actually says when a chunk is gone", () => {
    // Real wordings, which differ per engine — matching only Chrome's would
    // leave Safari and Firefox users stuck on the broken panel.
    const real = [
      "TypeError: Failed to fetch dynamically imported module: https://www.manowj.com/assets/PlayHub-q2PUc83g.js",
      "error loading dynamically imported module",
      "Importing a module script failed.",
      "ChunkLoadError: Loading chunk 12 failed.",
      "Unable to preload CSS for /assets/PlayHub-TZDaaye9.css",
    ];
    for (const message of real) {
      expect(isStaleBuildError(new Error(message)), message).toBe(true);
    }
  });

  it("ignores a plain failed fetch, which is a blocked tile, not a deploy", () => {
    // The regression this guards against. MapLibre throws exactly this when a
    // tile server is unreachable, and it happens constantly on bad networks.
    // Treating it as a stale build would reload the page under someone in a
    // tunnel, over and over.
    expect(isStaleBuildError(new Error("TypeError: Failed to fetch"))).toBe(false);
    expect(isStaleBuildError(new Error("NetworkError when attempting to fetch resource."))).toBe(false);
  });

  it("ignores ordinary render bugs, which a reload will not cure", () => {
    for (const message of [
      "Cannot read properties of undefined (reading 'lat')",
      "Maximum update depth exceeded",
      "Objects are not valid as a React child",
    ]) {
      expect(isStaleBuildError(new Error(message)), message).toBe(false);
    }
  });

  it("does not fall over on things that are not errors", () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(isStaleBuildError(value)).toBe(false);
    }
    // A thrown string is unusual but legal, and still worth catching.
    expect(isStaleBuildError("ChunkLoadError: Loading chunk 3 failed.")).toBe(true);
  });
});

describe("reloading at most once", () => {
  const now = 1_800_000_000_000;

  it("reloads when this tab has not tried yet", () => {
    expect(shouldReloadForStaleBuild(now, null)).toBe(true);
  });

  it("refuses a second reload straight after the first", () => {
    // The loop guard. Without it a build that is broken for another reason
    // would spin the tab forever and show the visitor nothing at all.
    expect(shouldReloadForStaleBuild(now, String(now - 1000))).toBe(false);
    expect(shouldReloadForStaleBuild(now, String(now))).toBe(false);
  });

  it("allows one again once the window has passed", () => {
    // A visitor who leaves a tab open through two separate deploys should be
    // rescued both times, not just the first.
    expect(shouldReloadForStaleBuild(now, String(now - RELOAD_GUARD_MS))).toBe(true);
    expect(shouldReloadForStaleBuild(now, String(now - 10 * 60_000))).toBe(true);
  });

  it("treats unreadable storage as 'never tried' rather than getting stuck", () => {
    // Private browsing and blocked storage return junk or nothing. Erring
    // towards reloading costs one extra page load; erring the other way
    // leaves a permanently broken panel.
    for (const junk of [null, "", "not-a-number", "NaN", "0", "-1"]) {
      expect(shouldReloadForStaleBuild(now, junk), junk ?? "null").toBe(true);
    }
  });
});
