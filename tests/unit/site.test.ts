import { describe, expect, it } from "vitest";
import { buildSiteQuery, classify, groupRoads } from "../../api/_routes/site";
import type { OverpassElement } from "../../api/_lib/overpass";
import { bhuvanUrl, globalPortals, portalGroups, statePortals } from "../../src/features/site/portals";

/**
 * Two things in this feature fail quietly rather than loudly, and these are
 * the tests for both.
 *
 * The Overpass query either asks for the right tags or it returns an empty
 * list, and an empty list looks exactly like "nothing is being built here" —
 * which is a wrong answer someone might act on. So the query text is asserted
 * tag by tag.
 *
 * The portal directory either matches a state or silently falls through to the
 * national links, which looks like a design decision rather than a bug. So the
 * matching is tested against the spellings geocoders actually return.
 */

function way(id: number, tags: Record<string, string>): OverpassElement {
  return { type: "way", id, tags, center: { lat: 17.4, lon: 78.4 } };
}

describe("the Overpass query", () => {
  const q = buildSiteQuery(17.385, 78.4867, 600);

  it("asks for every tag that carries development status", () => {
    // Each of these is a separate real-world way of recording the same thing,
    // and dropping any one of them loses a whole category of site.
    expect(q).toContain('way["highway"="construction"]');
    expect(q).toContain('way["proposed:highway"]');
    expect(q).toContain('way["building"="construction"]');
    expect(q).toContain('relation["building"="construction"]');
    expect(q).toContain('way["landuse"~"^(construction|brownfield|greenfield)$"]');
    expect(q).toContain('relation["landuse"~"^(construction|brownfield|greenfield)$"]');
  });

  it("asks for named roads", () => {
    expect(q).toContain('way["highway"]["name"]');
  });

  it("anchors every clause to the same point and radius", () => {
    const around = q.match(/\(around:600,17\.385,78\.4867\)/g) ?? [];
    // Seven clauses, one `around` each. If a future edit adds a clause without
    // the anchor, Overpass would happily query the whole planet.
    expect(around.length).toBe(7);
  });

  it("asks for tags and a centre point, not full geometry", () => {
    // Geometry would multiply the payload for a panel that only lists things.
    expect(q).toContain("out tags center");
    expect(q).not.toContain("out geom");
  });

  /*
    The bug this guards against is silent, and it is the worst kind this
    feature could have.

    Overpass applies an output cap to the whole result set, ordered by element
    id rather than by the order the clauses were written. Road segments
    outnumber construction sites heavily in any built-up area, and one street
    is routinely a dozen ways, so a single shared cap lets roads crowd the
    construction records out entirely. The panel would then report "0 under
    construction" for a street with three tower cranes on it — not because it
    found nothing, but because the answer was truncated.

    Development therefore gets its own `out` with its own budget.
  */
  it("gives development records their own output budget, so roads cannot crowd them out", () => {
    const outs = q.match(/out tags center \d+;/g) ?? [];
    expect(outs).toHaveLength(2);

    // Development is collected and printed before the roads clause is reached.
    const devOut = q.indexOf("out tags center 250;");
    const roadsClause = q.indexOf('way["highway"]["name"]');
    expect(devOut).toBeGreaterThan(q.indexOf('way["building"="construction"]'));
    expect(roadsClause).toBeGreaterThan(devOut);
  });
});

describe("classifying what came back", () => {
  it("reads the class a road under construction will become", () => {
    const f = classify(way(1, { highway: "construction", construction: "motorway", name: "Outer Ring Road" }));
    expect(f?.kind).toBe("road-works");
    // The difference between "a road is being built" and "a motorway is being
    // built" is the whole value of this tag.
    expect(f?.becoming).toBe("motorway");
    expect(f?.name).toBe("Outer Ring Road");
  });

  it("separates work happening from land merely scheduled for it", () => {
    expect(classify(way(2, { landuse: "construction" }))?.kind).toBe("construction-area");
    expect(classify(way(3, { landuse: "brownfield" }))?.kind).toBe("brownfield");
    expect(classify(way(4, { landuse: "greenfield" }))?.kind).toBe("greenfield");
    expect(classify(way(5, { "proposed:highway": "primary" }))?.kind).toBe("road-proposed");
  });

  it("ignores anything that is not a development record", () => {
    expect(classify(way(6, { highway: "residential", name: "Tank Bund Road" }))).toBeNull();
    expect(classify(way(7, { building: "yes" }))).toBeNull();
  });
});

describe("grouping ways into roads", () => {
  it("collapses the many ways of one street into a single road", () => {
    // A street split at every junction is the normal case in OSM, not the
    // exception. Listing the raw ways would show this road four times.
    const roads = groupRoads([
      way(1, { highway: "residential", name: "Necklace Road" }),
      way(2, { highway: "residential", name: "Necklace Road" }),
      way(3, { highway: "residential", name: "Necklace Road", surface: "asphalt" }),
      way(4, { highway: "residential", name: "Necklace Road", lanes: "2" }),
    ]);
    expect(roads).toHaveLength(1);
    expect(roads[0]!.segments).toBe(4);
    // Detail is picked up from whichever segment happens to carry it.
    expect(roads[0]!.surface).toBe("asphalt");
    expect(roads[0]!.lanes).toBe("2");
  });

  it("orders roads by how significant they are, then alphabetically", () => {
    const roads = groupRoads([
      way(1, { highway: "residential", name: "Zebra Lane" }),
      way(2, { highway: "primary", name: "Bank Street" }),
      way(3, { highway: "residential", name: "Apple Lane" }),
      way(4, { highway: "motorway", name: "NH 44" }),
    ]);
    expect(roads.map((r) => r.name)).toEqual(["NH 44", "Bank Street", "Apple Lane", "Zebra Lane"]);
  });

  it("leaves out service roads, paths and unnamed ways", () => {
    // In a dense area these outnumber real streets several to one, and nobody
    // asking "what roads are here" means the parking aisle behind a shop.
    const roads = groupRoads([
      way(1, { highway: "service", name: "Parking aisle" }),
      way(2, { highway: "footway", name: "Shortcut" }),
      way(3, { highway: "residential" }),
      way(4, { highway: "construction", name: "Future Road" }),
      way(5, { highway: "residential", name: "Real Street" }),
    ]);
    expect(roads.map((r) => r.name)).toEqual(["Real Street"]);
  });
});

describe("the portal directory", () => {
  it("matches a state however the geocoder spells it", () => {
    expect(statePortals("Telangana").length).toBeGreaterThan(0);
    expect(statePortals("telangana").length).toBeGreaterThan(0);
    // Nominatim often returns the state inside a longer string.
    expect(statePortals("National Capital Territory of Delhi").length).toBeGreaterThan(0);
  });

  it("returns nothing rather than a guess for a state it has not checked", () => {
    // The alternative is inventing a URL from a pattern, which produces a
    // government link that 404s — worse than no link at all.
    expect(statePortals("Nagaland")).toEqual([]);
    expect(statePortals(undefined)).toEqual([]);
  });

  it("points Telangana at Bhu Bharati, not the retired Dharani portal", () => {
    const urls = statePortals("Telangana").map((p) => p.url);
    expect(urls.some((u) => u.includes("bhubharati"))).toBe(true);
    expect(urls.some((u) => u.includes("dharani"))).toBe(false);
  });

  it("gives Bhuvan a bounding box, because it does not accept a point", () => {
    const url = bhuvanUrl(17.385, 78.4867, 0.004);
    // l/b/r/t are west, south, east, north. Getting the order wrong opens the
    // viewer somewhere else entirely, and it fails silently.
    expect(url).toContain("l=78.482700");
    expect(url).toContain("r=78.490700");
    expect(url).toContain("b=17.381000");
    expect(url).toContain("t=17.389000");
  });

  it("builds global viewer links in each provider's own parameter order", () => {
    const byLabel = new Map(globalPortals(17.385, 78.4867, 16).map((p) => [p.label, p.url]));
    // OSM is zoom/lat/lon, which is the one everybody writes backwards.
    expect(byLabel.get("OpenStreetMap")).toContain("#map=16/17.385000/78.486700");
    // Google requires api=1 and a percent-encoded comma.
    expect(byLabel.get("Google Maps")).toContain("api=1");
    expect(byLabel.get("Google Maps")).toContain("%2C");
    // Bing separates the pair with a tilde, not a comma.
    expect(byLabel.get("Bing Maps")).toContain("cp=17.385000~78.486700");
  });

  it("shows Indian record portals only in India", () => {
    const inIndia = portalGroups(17.385, 78.4867, "IN", "Telangana");
    expect(inIndia.some((g) => g.title.includes("National (India)"))).toBe(true);

    // A directory of Indian revenue portals is noise to someone in Berlin.
    const elsewhere = portalGroups(52.52, 13.405, "DE", "Berlin");
    expect(elsewhere.some((g) => g.title.includes("India"))).toBe(false);
    expect(elsewhere.some((g) => g.title === "Imagery and open maps")).toBe(true);
  });

  it("never lists a portal without a URL or an explanation", () => {
    // Every row in this directory is asking someone to leave the app. A row
    // with no note is a row that cannot say why.
    for (const group of portalGroups(17.385, 78.4867, "IN", "Maharashtra")) {
      for (const p of group.portals) {
        expect(p.url).toMatch(/^https?:\/\//);
        expect(p.note.length).toBeGreaterThan(10);
      }
    }
  });
});
