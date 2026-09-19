import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Two ways this product can quietly lie about itself, both found by audit
 * rather than by anyone using it, and both invisible because the wrong thing
 * looked exactly like the right thing.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("the timezone shown for a place", () => {
  it("is never the reader's own", () => {
    /*
      Every Location was built with
      Intl.DateTimeFormat().resolvedOptions().timeZone, which is the
      BROWSER's timezone, and Location Identity printed it in a row headed
      with the searched place. Someone in Hyderabad looking up Toronto saw
      IST presented as a fact about Toronto, in a row styled identically to
      the sourced figures beside it.

      Open-Meteo already returns the real zone for the queried point, and the
      weather handler was parsing it away. The fabricated value is gone from
      the type, so the compiler now refuses any attempt to put it back.
    */
    for (const file of [
      ["src", "services", "geocode.ts"],
      ["src", "features", "location", "selectPoint.ts"],
      ["src", "hooks", "useSharedLocationFromUrl.ts"],
    ]) {
      expect(read(...file), file.join("/")).not.toMatch(/timezone:\s*Intl\.DateTimeFormat/);
    }
  });

  it("comes from the provider that actually knows it", () => {
    const handler = read("api", "_routes", "weather.ts");
    // Asked for, and no longer discarded when it arrives.
    expect(handler).toContain('url.searchParams.set("timezone", "auto")');
    expect(handler).toMatch(/timezone:\s*data\.timezone/);
  });

  it("says so plainly when there is no real answer", () => {
    // The failure mode this replaces is substituting something plausible.
    const panel = read("src", "features", "location", "LocationIdentityPanel.tsx");
    expect(panel).toContain("Unavailable");
    expect(panel).not.toContain("location.timezone");
  });
});

describe("the command palette", () => {
  it("has no 'coming soon' entries at all", () => {
    /*
      "Compare locations" and "Generate report" sat disabled behind empty
      handlers long after both shipped: ComparePage is routed at
      /compare/<pair>, and the report has a working button in the side
      panel. The palette was understating the product to everyone who
      pressed Ctrl+K, and it survived because nothing rechecks a `false`
      once it has been written down.

      Anything genuinely unbuilt belongs on the Feature Status page, which
      exists for exactly that, not in a list of things you can press.
    */
    const palette = read("src", "features", "command", "CommandPalette.tsx");
    const code = palette.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/coming soon/i);
    // An empty handler is the shape the dead entries took.
    expect(code).not.toMatch(/run:\s*\(\)\s*=>\s*\{\s*\}/);
  });
});

describe("the games that were deliberately unlisted", () => {
  it("records why, so an audit cannot mistake the decision for a bug", () => {
    /*
      Six map-based games were unlisted on request and their code kept
      rather than deleted. Any automated sweep for "components nothing
      renders" therefore reports all six, and one did: it named them as the
      single most serious finding in a full codebase audit, and nearly led to
      restoring games that had been removed on purpose.

      The note in the registry is the only thing standing between the next
      reader and that same mistake, so this asserts it is still there.
    */
    const registry = read("src", "features", "play", "registry.tsx");
    expect(registry).toMatch(/must not be added back/);
    for (const game of ["whereAmI", "mapRace", "pin", "country", "change"]) {
      expect(registry, game).toContain(game);
    }
  });

  it("still does not import them", () => {
    const registry = read("src", "features", "play", "registry.tsx");
    const imports = registry.split("export const GAMES")[0]!;
    for (const component of ["WhereAmI", "MapRace", "PinThePlace", "CountryHunt", "SpotTheChange", "DailyChallenge"]) {
      expect(imports, component).not.toMatch(new RegExp(`import\\s*\\{\\s*${component}\\b`));
    }
  });
});
