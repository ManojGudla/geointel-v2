import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadTagManager,
  readConsent,
  resetLoadedForTests,
  shouldAskConsent,
  writeConsent,
} from "../../src/features/analytics/consent";

/**
 * Google Analytics, and the promise attached to it.
 *
 * Adding analytics to this site broke a claim the Privacy page made as a
 * checkable fact — that there were no analytics and no third-party tags at
 * all. The replacement claim is narrower and has to actually hold: nothing
 * from Google is fetched until the visitor accepts.
 *
 * That is the property these tests exist for. A banner that loads the tracker
 * first and asks second is the pattern everyone complains about, and it would
 * make the Privacy page false for every visitor who declines — which is worse
 * than having no banner, because it is a written promise being broken.
 */

describe("consent gates the tag", () => {
  beforeEach(() => {
    resetLoadedForTests();
    localStorage.clear();
  });

  it("asks when analytics is configured and nothing has been chosen", () => {
    vi.stubEnv("VITE_GTM_ID", "GTM-TEST123");
    expect(shouldAskConsent(null)).toBe(true);
    vi.unstubAllEnvs();
  });

  it("never asks when there is nothing to consent to", () => {
    // With no container configured the site behaves exactly as it did before,
    // which is what makes it safe to ship this code before the ID exists.
    vi.stubEnv("VITE_GTM_ID", "");
    expect(shouldAskConsent(null)).toBe(false);
    vi.unstubAllEnvs();
  });

  it("treats a placeholder or malformed id as not configured", () => {
    // A half-finished environment variable must not ship a broken tag and a
    // banner asking permission for something that cannot work.
    for (const bad of ["   ", "TODO", "G-ABC123", "GTM_123", "your-id-here"]) {
      vi.stubEnv("VITE_GTM_ID", bad);
      expect(shouldAskConsent(null), bad).toBe(false);
      vi.unstubAllEnvs();
    }
  });

  it("stops asking once a choice is made, including a refusal", () => {
    vi.stubEnv("VITE_GTM_ID", "GTM-TEST123");
    expect(shouldAskConsent("granted")).toBe(false);
    // The important half: declining sticks. Re-asking on every load until the
    // visitor gives in is the thing that makes these banners hated.
    expect(shouldAskConsent("denied")).toBe(false);
    vi.unstubAllEnvs();
  });

  it("remembers a refusal across page loads", () => {
    writeConsent("denied");
    expect(readConsent()).toBe("denied");
  });

  it("treats blocked storage as 'not asked', never as consent", () => {
    // The safe direction when we cannot know. Defaulting to granted would
    // load a tracker for someone who may have refused.
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readConsent()).toBeNull();
    spy.mockRestore();
  });
});

describe("the loader", () => {
  beforeEach(() => resetLoadedForTests());
  afterEach(() => {
    document.head.querySelectorAll("script[src*='googletagmanager']").forEach((s) => s.remove());
  });

  it("adds Google's script only when called, and only once", () => {
    expect(document.head.querySelector("script[src*='googletagmanager']")).toBeNull();

    expect(loadTagManager("GTM-TEST123")).toBe(true);
    const scripts = document.head.querySelectorAll("script[src*='googletagmanager']");
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.getAttribute("src")).toContain("GTM-TEST123");

    // A second call must not stack a second copy of the tag.
    expect(loadTagManager("GTM-TEST123")).toBe(false);
    expect(document.head.querySelectorAll("script[src*='googletagmanager']")).toHaveLength(1);
  });

  it("starts the dataLayer the way Tag Manager expects", () => {
    loadTagManager("GTM-TEST123");
    const layer = (window as unknown as { dataLayer?: Array<Record<string, unknown>> }).dataLayer;
    expect(Array.isArray(layer)).toBe(true);
    expect(layer![0]).toHaveProperty("gtm.start");
    expect(layer![0]!.event).toBe("gtm.js");
  });
});

describe("the security policy still forbids inline script", () => {
  const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
    headers: Array<{ headers: Array<{ key: string; value: string }> }>;
  };
  const csp =
    config.headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy")?.value ?? "";
  const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";

  it("allows Google's domain and nothing else new", () => {
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("https://www.googletagmanager.com");
  });

  it("still refuses inline script, which is why the loader uses DOM calls", () => {
    // Google's copy-paste snippet is an inline <script> and would need
    // 'unsafe-inline' site-wide. Building the same tag from an already-trusted
    // module avoids that — the exact failure that silently killed the
    // blank-page recovery guard.
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("lets analytics report back, without opening connect-src to everything", () => {
    const connect = csp.split(";").find((d) => d.trim().startsWith("connect-src")) ?? "";
    expect(connect).toContain("google-analytics.com");
    expect(connect).not.toContain("connect-src *");
  });
});

describe("the privacy page tells the truth about it", () => {
  const facts = readFileSync(
    join(process.cwd(), "src", "features", "privacy", "privacyFacts.ts"),
    "utf8"
  );

  it("no longer claims there are no analytics", () => {
    // The claim that had to go. Leaving it would make the page a written lie
    // the moment the container id is set.
    expect(facts).not.toContain("No Google Analytics, no pixels");
    expect(facts).not.toContain("There are no analytics, trackers or ad scripts");
  });

  it("says analytics is opt-in, and says what accepting costs", () => {
    expect(facts).toContain("Analytics only if you say yes");
    expect(facts.toLowerCase()).toContain("google receives your visit");
  });
});
