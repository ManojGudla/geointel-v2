import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { scrubProps, track } from "../../src/services/analytics";

/**
 * The two promises this module makes, held to the code rather than to a
 * privacy page.
 *
 * NOTHING WITHOUT CONSENT. A visitor who declined, or who has not been asked
 * yet, must generate no events. Not queued for later — a queued event replayed
 * after consent would make the question retroactive, which is not consent.
 *
 * NO COORDINATES, EVER. This is a mapping application, so the hazard is
 * specific and severe: a lat/lon pair IS a person's location, and the privacy
 * page says the app does not collect one. An event property is the easiest
 * place in the codebase for one to leak out, because attaching the place you
 * just measured feels like useful context right up until you notice you have
 * shipped someone's home address to Google.
 */

interface TestWindow extends Window {
  dataLayer?: unknown[];
}

const w = globalThis as unknown as TestWindow;

function pushed(): Array<Record<string, unknown>> {
  return (w.dataLayer ?? []) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  w.dataLayer = [];
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/*
  The real key and the real shape, read out of consent.ts rather than assumed.

  Worth stating because the first version of this file guessed a JSON envelope
  and a different key, and both consent tests passed vacuously: nothing was
  recorded, which is what the test wanted to see, but for the wrong reason. A
  gating test that cannot tell "correctly blocked" from "never worked" is not
  testing the gate.
*/
const CONSENT_KEY = "manowj.consent.v1";
function grantConsent() {
  localStorage.setItem(CONSENT_KEY, "granted");
}
function denyConsent() {
  localStorage.setItem(CONSENT_KEY, "denied");
}

describe("consent gating", () => {
  it("records nothing before the visitor has been asked", () => {
    track("search_started", { queryLength: 5 });
    expect(pushed()).toHaveLength(0);
  });

  it("records nothing at all from a visitor who declined", () => {
    denyConsent();
    track("search_started", { queryLength: 5 });
    track("result_shared");
    track("place_opened");
    expect(pushed()).toHaveLength(0);
  });

  it("records once consent is granted", () => {
    grantConsent();
    track("place_opened", { source: "search" });
    expect(pushed()).toHaveLength(1);
    expect(pushed()[0]).toMatchObject({ event: "place_opened", source: "search" });
  });

  it("stops the moment consent is withdrawn, without a reload", () => {
    // Checked per event rather than cached at load, because a person can
    // change their mind while the page is still open.
    grantConsent();
    track("place_opened");
    denyConsent();
    track("place_opened");
    expect(pushed()).toHaveLength(1);
  });
});

describe("scrubbing", () => {
  it("drops anything that could be a coordinate", () => {
    // The whole reason this function exists. Not rounded, not truncated —
    // dropped, so the rule stays checkable.
    const out = scrubProps({ lat: 17.385, lon: 78.4867, latitude: 17.4, lng: 78.5, count: 3 });
    expect(out).toEqual({ count: 3 });
  });

  it("drops search text, addresses and anything that names a person", () => {
    const out = scrubProps({
      query: "hospitals near my house",
      address: "12 Some Street",
      name: "Manoj",
      email: "a@b.com",
      userId: "abc",
      kind: "question",
    });
    expect(out).toEqual({ kind: "question" });
  });

  it("keeps only numbers whose key makes their meaning unambiguous", () => {
    // A bare number could be anything, including half a coordinate. A number
    // called radiusMeters could not.
    const out = scrubProps({ radiusMeters: 500, count: 12, someNumber: 17.385 });
    expect(out).toEqual({ radiusMeters: 500, count: 12 });
  });

  it("caps string values, so free text cannot ride along in a label", () => {
    const out = scrubProps({ portal: "x".repeat(200) });
    expect(String(out.portal)).toHaveLength(60);
  });

  it("drops undefined rather than sending empty keys", () => {
    expect(scrubProps({ a: undefined, b: "ok" })).toEqual({ b: "ok" });
  });

  it("refuses non-finite numbers", () => {
    expect(scrubProps({ count: Infinity, score: NaN })).toEqual({});
  });
});

describe("never breaking what it measures", () => {
  it("does not throw when there is no dataLayer", () => {
    grantConsent();
    delete w.dataLayer;
    expect(() => track("place_opened")).not.toThrow();
  });

  it("does not throw when storage is unavailable", () => {
    // Private windows and blocked site data both make this throw, and it sits
    // in the middle of real user actions like a share tap.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => track("result_shared")).not.toThrow();
    expect(pushed()).toHaveLength(0);
  });
});
