import { describe, expect, it } from "vitest";
import { extractSite } from "../../api/_lib/propertySite";
import { assembleRings, pointInPolygon, relationPolygons } from "../../api/_lib/geometry";
import type { OverpassElement } from "../../api/_lib/overpass";
import { analyzeProperty } from "../../src/features/property/propertyAnalyzer";
import { heightFromTags, parseHeight } from "../../src/features/property/buildingUse";
import type { GISEvidence, PropertySite } from "../../src/types/gis";

/**
 * The building at the exact point decides the property type.
 *
 * Reported 25 November 2026: clicking Wave Rock Tower 2.3, an office tower
 * in Hyderabad, gave "RESIDENTIAL, VERIFIED, 95%: a residential building
 * mapped 28m from this point". The footprints below are the real ones,
 * read from the live site's building data on that day (OpenStreetMap ways
 * 630847222 and 342668624); the click is the reporter's own.
 */
const CLICK = { lat: 17.419687, lon: 78.347545 };
const META = { dataAsOf: "2026-11-25T16:00:00Z", fetchedAt: "2026-11-25T17:30:00.000Z" };

const geom = (ring: Array<[number, number]>) => ring.map(([lon, lat]) => ({ lat, lon }));
const WAVE_ROCK_RING: Array<[number, number]> = [
  [78.347406, 17.419826], [78.347002, 17.419193], [78.347108, 17.419139], [78.347084, 17.4191], [78.347157, 17.419062],
  [78.347174, 17.419093], [78.347297, 17.419019], [78.347726, 17.419642], [78.347406, 17.419826],
];
const HOUSE_RING: Array<[number, number]> = [[78.347756, 17.420242], [78.347734, 17.420151], [78.347807, 17.420135], [78.347829, 17.420226], [78.347756, 17.420242]];

const way = (id: number, tags: Record<string, string>, ring: Array<[number, number]>): OverpassElement => ({ type: "way", id, tags, geometry: geom(ring) });
const node = (id: number, lat: number, lon: number, tags: Record<string, string>): OverpassElement => ({ type: "node", id, lat, lon, tags });
const area = (wayId: number, tags: Record<string, string>): OverpassElement => ({ type: "area" as never, id: 2_400_000_000 + wayId, tags });

/** A square footprint of `half` metres either side of a centre. */
function square(lat: number, lon: number, half: number): Array<[number, number]> {
  const dLat = half / 111_320;
  const dLon = half / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]];
}

const AREA_EVIDENCE: GISEvidence = {
  trust: "verified",
  radiusMeters: 2000,
  counts: { buildings: 2437, shops: 82, offices: 57, residential: 374, industrial: 4, institutional: 22, amenities: 142, tourism: 0, transport: 9 },
  scores: { commercial: 40, residential: 90, industrial: 2, institutional: 5, landmark: 0, transport: 3 },
  subject: { kind: "residential building", category: "residential", distanceMeters: 28 },
  features: [],
  source: "OpenStreetMap / Overpass",
  fetchedAt: META.fetchedAt,
};

function site(elements: OverpassElement[], at = CLICK): PropertySite {
  return extractSite(elements, at, META);
}

describe("the reported office tower", () => {
  const elements = [
    way(630847222, { building: "office", "building:levels": "9", name: "Wave Rock Tower 2.3" }, WAVE_ROCK_RING),
    way(342668624, { building: "residential" }, HOUSE_RING),
  ];

  it("finds the building the click is inside, not the nearest centre", () => {
    const s = site(elements);
    expect(s.building).toMatchObject({ id: 630847222, osmType: "way", containsPoint: true, distanceMeters: 0, url: "https://www.openstreetmap.org/way/630847222" });
  });

  it("is Commercial, verified from the building's own tag, however residential the area is", () => {
    const analysis = analyzeProperty(AREA_EVIDENCE, site(elements));
    expect(analysis.classification).toBe("Commercial");
    expect(analysis.trust).toBe("verified");
    expect(analysis.confidence).toBe(90);
    expect(analysis.reasoning).toBe('"Wave Rock Tower 2.3" is mapped in OpenStreetMap as an office building (building=office), and this point is inside it.');
    expect(analysis.basis).toBe("building");
  });

  it("gives the building's height and floors, and how the height is known", () => {
    const { building } = analyzeProperty(AREA_EVIDENCE, site(elements));
    expect(building).toMatchObject({ name: "Wave Rock Tower 2.3", kind: "office building", heightMeters: 28.8, heightSource: "floors", levels: 9 });
    expect(building!.footprintM2).toBeGreaterThan(3000);
  });

  it("links the building on OpenStreetMap, and keeps the area as context only", () => {
    const analysis = analyzeProperty(AREA_EVIDENCE, site(elements));
    expect(analysis.links?.[0]).toEqual({ label: "Wave Rock Tower 2.3 on OpenStreetMap", url: "https://www.openstreetmap.org/way/630847222" });
    expect(analysis.surroundings).toBe(
      "Around it, within 2000 m: 374 residential buildings, 82 shops, 57 offices, 4 industrial features, 22 public or institutional features. That describes the area, not this property."
    );
  });

  it("calls the house next door a house", () => {
    const house = analyzeProperty(AREA_EVIDENCE, site(elements, { lat: 17.42019, lon: 78.34778 }));
    expect(house.classification).toBe("Residential");
    expect(house.trust).toBe("verified");
  });
});

describe("what a building's type cannot settle", () => {
  const CENTRE = { lat: 51.5145, lon: -0.1235 };
  const FOOT = square(CENTRE.lat, CENTRE.lon, 15);

  it("homes with a shop mapped inside are Mixed Use", () => {
    const a = analyzeProperty(null, site([way(1, { building: "apartments", "building:levels": "5" }, FOOT), node(11, CENTRE.lat + 0.00003, CENTRE.lon, { shop: "convenience", name: "Corner Shop" })], CENTRE));
    expect(a.classification).toBe("Mixed Use");
    expect(a.trust).toBe("verified");
    expect(a.reasoning).toContain("Corner Shop (convenience shop)");
  });

  it("an untyped building full of offices is Commercial, from what is inside it", () => {
    const a = analyzeProperty(
      null,
      site(
        [
          way(2, { building: "yes" }, FOOT),
          node(21, CENTRE.lat + 0.00002, CENTRE.lon, { office: "it", name: "Accenture" }),
          node(22, CENTRE.lat - 0.00002, CENTRE.lon, { office: "company" }),
          // Outside the footprint: must not count.
          node(23, CENTRE.lat + 0.001, CENTRE.lon, { amenity: "school" }),
        ],
        CENTRE
      )
    );
    expect(a.classification).toBe("Commercial");
    expect(a.basis).toBe("inside");
    expect(a.confidence).toBe(80);
  });

  it("an untyped building on commercial land is Commercial, said as an inference", () => {
    const a = analyzeProperty(null, site([way(3, { building: "yes" }, FOOT), area(900, { landuse: "commercial", name: "Wave Rock SEZ" })], CENTRE));
    expect(a.classification).toBe("Commercial");
    expect(a.trust).toBe("inferred");
    expect(a.confidence).toBe(60);
    expect(a.reasoning).toContain("commercial land (Wave Rock SEZ)");
    expect(a.links?.some((l) => l.url === "https://www.openstreetmap.org/way/900")).toBe(true);
  });

  it("a campus says more than a zone", () => {
    const a = analyzeProperty(null, site([way(4, { building: "yes" }, FOOT), area(901, { landuse: "residential" }), area(902, { amenity: "university", name: "City College" })], CENTRE));
    expect(a.classification).toBe("Institutional");
    expect(a.confidence).toBe(70);
  });

  it("falls back to a telling word in the name, and only a weak one", () => {
    const a = analyzeProperty(null, site([way(5, { building: "yes", name: "Sunshine Apartments" }, FOOT)], CENTRE));
    expect(a.classification).toBe("Residential");
    expect(a.trust).toBe("inferred");
    expect(a.confidence).toBe(45);
  });

  it("says Unknown, not a guess, when nothing says what the building is for", () => {
    const a = analyzeProperty(AREA_EVIDENCE, site([way(6, { building: "yes" }, FOOT)], CENTRE));
    expect(a.classification).toBe("Unknown");
    expect(a.trust).toBe("unavailable");
    expect(a.confidence).toBe(0);
    // The surroundings are still shown, as context.
    expect(a.surroundings).toContain("374 residential buildings");
  });

  it("a tap just outside a wall still reads that building, and says it was next to it", () => {
    const tap = { lat: CENTRE.lat + 20 / 111_320, lon: CENTRE.lon }; // 5 m beyond the 15 m half-width
    const a = analyzeProperty(null, site([way(7, { building: "house" }, FOOT)], tap));
    expect(a.classification).toBe("Residential");
    expect(a.confidence).toBe(75);
    expect(a.reasoning).toContain("this point is 5 m from its outline");
  });

  it("with no building and no land use, reads only the surroundings, at low confidence", () => {
    const a = analyzeProperty(AREA_EVIDENCE, site([], CENTRE));
    expect(a.classification).toBe("Residential");
    expect(a.basis).toBe("area");
    expect(a.confidence).toBeLessThanOrEqual(40);
    expect(a.reasoning).toMatch(/^No building is mapped at this exact point/);
  });

  it("open land mapped as residential is read as land, not as a building", () => {
    const a = analyzeProperty(null, site([area(903, { landuse: "residential" })], CENTRE));
    expect(a.classification).toBe("Residential");
    expect(a.basis).toBe("land");
    expect(a.confidence).toBe(50);
  });
});

describe("buildings drawn as multipolygons", () => {
  const CENTRE = { lat: 48.8566, lon: 2.3522 };

  it("join an outline split into several ways, in any order and direction", () => {
    const ring = square(CENTRE.lat, CENTRE.lon, 30);
    const rings = assembleRings([ring.slice(2, 4), ring.slice(0, 3).reverse(), ring.slice(3)]);
    expect(rings).toHaveLength(1);
    expect(pointInPolygon([CENTRE.lon, CENTRE.lat], { outer: rings[0]!, holes: [] })).toBe(true);
  });

  it("a point in the courtyard is not inside the building", () => {
    const outer = square(CENTRE.lat, CENTRE.lon, 60);
    const inner = square(CENTRE.lat, CENTRE.lon, 40);
    const polygons = relationPolygons([
      { type: "way", role: "outer", geometry: geom(outer) },
      { type: "way", role: "inner", geometry: geom(inner) },
    ]);
    expect(pointInPolygon([CENTRE.lon, CENTRE.lat], polygons[0]!)).toBe(false);
    const inTheWing = { lat: CENTRE.lat + 50 / 111_320, lon: CENTRE.lon };
    const s = site(
      [{ type: "relation", id: 77, tags: { building: "commercial", type: "multipolygon" }, members: [{ type: "way", ref: 1, role: "outer", geometry: geom(outer) }, { type: "way", ref: 2, role: "inner", geometry: geom(inner) }] }],
      inTheWing
    );
    expect(s.building).toMatchObject({ osmType: "relation", id: 77, containsPoint: true, url: "https://www.openstreetmap.org/relation/77" });
  });

  it("a building larger than the search reaches is still found through the area index", () => {
    const s = site([area(555, { building: "retail", name: "Grand Mall" })], CENTRE);
    expect(s.building).toMatchObject({ osmType: "way", id: 555, containsPoint: true });
    expect(analyzeProperty(null, s).classification).toBe("Commercial");
  });

  it("picks the smallest footprint when one building sits inside another", () => {
    const s = site([way(10, { building: "yes" }, square(CENTRE.lat, CENTRE.lon, 80)), way(11, { building: "house" }, square(CENTRE.lat, CENTRE.lon, 8))], CENTRE);
    expect(s.building?.id).toBe(11);
  });
});

describe("heights", () => {
  it("reads a mapped height in metres or feet", () => {
    expect(parseHeight("28.8")).toBe(28.8);
    expect(parseHeight("28.8 m")).toBe(28.8);
    expect(parseHeight("95 ft")).toBeCloseTo(28.96, 2);
    expect(parseHeight("tall")).toBeNull();
  });

  it("prefers a mapped height, works one out from floors, and otherwise says nothing", () => {
    expect(heightFromTags({ height: "40", "building:levels": "9" })).toEqual({ meters: 40, source: "mapped", levels: 9 });
    expect(heightFromTags({ "building:levels": "9" })).toEqual({ meters: 28.8, source: "floors", levels: 9 });
    expect(heightFromTags({ building: "office" })).toEqual({ meters: null, source: null, levels: null });
  });
});
