import type { Page, Route } from "@playwright/test";

/**
 * MOCK API answers for the end-to-end journeys. Every /api call is answered
 * here; anything without a fixture gets a 503, which is also how the app is
 * meant to cope with a provider being down.
 */
const AT = "2026-11-25T07:30:00.000Z";
export const HITEC = { lat: 17.4474, lon: 78.3762 };

const EVIDENCE = [
  { id: "E1", label: "Place name", value: "HITEC City", kind: "retrieved", source: "OpenStreetMap / Nominatim", retrievedAt: AT },
  { id: "E2", label: "Mapped offices within 250 m", value: "14", kind: "retrieved", source: "OpenStreetMap via Overpass", retrievedAt: AT },
  { id: "E3", label: "Nearest hospital or clinic", value: "Care Clinic, 640 m away in a straight line", kind: "computed", source: "maNOWj, from OpenStreetMap via Overpass", retrievedAt: AT },
  { id: "E4", label: "Route distance", value: "1.9 km", kind: "retrieved", source: "OSRM", retrievedAt: AT },
];

const FIXTURES: Record<string, unknown> = {
  "reverse-geocode": { ok: true, location: { lat: HITEC.lat, lon: HITEC.lon, name: "HITEC City", displayName: "HITEC City, Hyderabad, Telangana, India", source: "OpenStreetMap / Nominatim", address: { city: "Hyderabad", state: "Telangana", country: "India", countryCode: "IN" } } },
  health: { ok: true, status: "ok" },
  "ai/ask": {
    ok: true,
    result: {
      request: "Evaluate this place for a family home and plan a route to the nearest hospital",
      understood: "Asked to analyse what is mapped around the place, assess the property and route to the nearest hospital or clinic.",
      agents: ["gis", "navigation"],
      sections: [
        { agent: "gis", summary: "Offices dominate here.", findings: [{ text: "Offices dominate here, with 14 mapped within 250 m.", evidenceIds: ["E2"] }], confidence: { level: "high", reason: "Every source this agent uses answered in full." } },
        { agent: "navigation", summary: "Care Clinic is 1.9 km by road.", findings: [{ text: "The nearest clinic is Care Clinic, 1.9 km by road.", evidenceIds: ["E3", "E4"] }], confidence: { level: "high", reason: "Every source this agent uses answered in full." } },
      ],
      evidence: EVIDENCE,
      steps: [
        { step: "Understanding the request: 2 agents chosen", status: "ok", ms: 1 },
        { step: "Counting mapped features (OpenStreetMap via Overpass)", status: "ok", ms: 1800 },
        { step: "Calculating the route (routing provider)", status: "ok", ms: 2400 },
        { step: "Writing the report (AI model, one request for all agents)", status: "ok", ms: 6100 },
        { step: "Checking every number against the evidence", status: "ok", ms: 0 },
      ],
      route: { name: "Care Clinic", lat: 17.452, lon: 78.379, mode: "car" },
      sources: ["OpenStreetMap via Overpass", "OSRM"],
      model: "mock-model",
      generatedAt: AT,
      removedSentences: 0,
    },
  },
};

export async function stubApi(page: Page): Promise<void> {
  await page.route("**/api/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\//, "");
    const body = FIXTURES[path];
    if (body) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Stubbed in end-to-end tests.", code: "PROVIDER_UNAVAILABLE" }) });
  });
  // Map tiles and other outside requests are not needed for these journeys.
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
}

/** Skips first-visit notices so each journey starts at the app itself. */
export async function skipNotices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("manowj.consent.v1", "denied");
      localStorage.setItem("geointel.freeNoticeSeen.v1", "1");
      localStorage.setItem("geointel.onboardingDone.v1", "1");
      localStorage.setItem("manowj.starter.dismissed.v1", "1");
    } catch {
      /* storage blocked: the notices will show, and the tests close them */
    }
  });
}
