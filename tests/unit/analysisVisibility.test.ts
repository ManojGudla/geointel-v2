import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiGet } from "../../src/services/apiClient";

/**
 * Three defects that shared one shape: the app had the answer and showed the
 * user something else.
 */

afterEach(() => vi.unstubAllGlobals());

describe("a finished analysis is never hidden behind the empty state", () => {
  /*
    Reported as: "after clicking anything it moves to analyse, and in analyse
    there is only the measurement and area tool."

    Exactly right, and the cause was an ordering bug. askTheMap() in SearchBar
    deliberately runs from the centre of the map when nothing is selected -
    that is what makes an example chip like "Schools · 1 km" work on the very
    first screen - and then sends the user to Analyse, because its own comment
    says that is where the answer renders. But the panel checked "is a
    location selected?" BEFORE "is there an answer?", and returned "Select a
    location". The analysis had run, the result was in the store, and the
    screen told the user to do the thing they had just done.
  */
  const source = readFileSync(
    join(process.cwd(), "src", "features", "analysis", "SpatialAnalysisPanel.tsx"),
    "utf8"
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("checks for an answer before falling back to the empty state", () => {
    expect(source).toMatch(/const hasAnswer\s*=/);
    expect(source).toMatch(/if \(!location && !hasAnswer\)/);
  });

  it("counts a running and a failed analysis as answers too", () => {
    // A spinner and an error are both "something happened". Either one
    // replaced by "Select a location" reads as the click having done nothing.
    const line = source.match(/const hasAnswer\s*=.*/)?.[0] ?? "";
    expect(line).toMatch(/result !== null/);
    expect(line).toMatch(/"running"/);
    expect(line).toMatch(/"error"/);
  });

  it("says which point the figure describes when none was chosen", () => {
    // An answer measured from the map centre is a real answer about a point
    // the reader did not pick, so it is labelled rather than left to guess.
    expect(source).toMatch(/analysis__origin-note/);
    expect(source).toMatch(/!location && \(/);
  });

  it("disables Run rather than letting it silently do nothing", () => {
    expect(source).toMatch(/disabled=\{status === "running" \|\| !location\}/);
  });
});

describe("failure messages do not carry the user's coordinates", () => {
  /*
    Every message in apiClient used to interpolate the whole request path, and
    /api/nearby carries lat and lon in its query string. A dropped connection
    therefore printed someone's coordinates on screen, in an application whose
    analytics go out of their way to refuse coordinate-shaped values.
  */
  const COORDS = { lat: 17.385044, lon: 78.486671, category: "schools", radius: 1000 };

  it("names the endpoint but not its arguments when the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    const error = await apiGet("/api/nearby", COORDS).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;

    expect(message).toContain("/api/nearby");
    expect(message).not.toContain("?");
    expect(message).not.toMatch(/17\.38|78\.48/);
  });

  it("keeps them out of an unexpected-response message too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }))
    );

    const error = await apiGet("/api/nearby", COORDS).catch((e: Error) => e);
    const message = (error as Error).message;

    expect(message).toContain("/api/nearby");
    expect(message).toContain("502");
    expect(message).not.toContain("?");
    expect(message).not.toMatch(/17\.38|78\.48/);
  });

  it("still passes a real server explanation straight through", async () => {
    // When the API says what went wrong, that sentence is the useful one and
    // it is not replaced by a generic message.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: false, error: "OpenStreetMap is rate limiting us right now." }),
      }))
    );

    const error = await apiGet("/api/nearby", COORDS).catch((e: Error) => e);
    expect((error as Error).message).toBe("OpenStreetMap is rate limiting us right now.");
  });
});

describe("the getting-started card clears the floating search", () => {
  /*
    Measured before the fix: the card's heading sat underneath the action
    row's hint text at 1366x768 (68px of overlap), 1280x800 (52px), 1536x864
    (20px), 1440x900 and 1919x897. Only a full 1080p window escaped. Those
    first two are the commonest laptop resolutions there are, so most desktop
    visitors read the sentence that explains this product through a box lying
    on top of it.

    The card is centred in the stage, so every pixel of height the window
    loses raises it by half a pixel - and `--above-consent` shoves a centred
    child up by half its padding again, on the one visit this card appears.
  */
  const css = readFileSync(join(process.cwd(), "src", "features", "onboarding", "MapOnboarding.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  );

  it("reserves room at the top for the search column", () => {
    const rule = css.match(/\.onboarding\s*\{[^}]*\}/s)?.[0] ?? "";
    const padding = rule.match(/padding:\s*(\d+)px/)?.[1];
    expect(padding, "no top padding reserved on .onboarding").toBeDefined();
    // The search box plus the action row measure ~163px from the stage top.
    expect(Number(padding)).toBeGreaterThanOrEqual(170);
  });

  it("still lets the consent banner push it clear of the bottom", () => {
    expect(css).toMatch(/\.onboarding--above-consent\s*\{[^}]*padding-bottom/s);
  });
});
