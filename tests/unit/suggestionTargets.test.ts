import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A suggestion button must lead where its label says.
 *
 * "Follow route" opened the Travel section, which is the flights, trains and
 * hotels planner, not turn-by-turn directions. Someone mid-route pressing it
 * lost their directions panel to a booking form.
 */
const source = readFileSync(join(__dirname, "..", "..", "src", "features", "workspace", "QuickActions.tsx"), "utf8");

function caseBody(action: string): string {
  const start = source.indexOf(`case "${action}":`);
  expect(start, `no case for ${action}`).toBeGreaterThan(-1);
  const end = source.indexOf("break;", start);
  return source.slice(start, end);
}

describe("next-step suggestion targets", () => {
  it("opens Directions for a route in progress, not the trip planner", () => {
    const body = caseBody("navigate");
    expect(body).toContain("openDirections(");
    expect(body).not.toContain('openSection("travel")');
  });

  it("opens the panel that shows the measurement total", () => {
    expect(caseBody("measure")).toContain('openSection("tools")');
  });
});
