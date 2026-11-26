import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { PropertyResult } from "../../src/features/property/PropertyIntelligencePanel";
import { analyzeProperty } from "../../src/features/property/propertyAnalyzer";
import type { PropertySite } from "../../src/types/gis";

/** How the Property panel shows the building at the point (MOCK: a fixed lookup result). */
const SITE: PropertySite = {
  lat: 17.419687,
  lon: 78.347545,
  building: {
    osmType: "way",
    id: 630847222,
    url: "https://www.openstreetmap.org/way/630847222",
    tags: { building: "office", "building:levels": "9", name: "Wave Rock Tower 2.3", "addr:street": "Nanakramguda Road" },
    containsPoint: true,
    distanceMeters: 0,
    footprintM2: 3412,
  },
  inside: [],
  areas: [],
  source: "OpenStreetMap / Overpass",
  dataAsOf: "2026-11-25T16:00:00Z",
  fetchedAt: "2026-11-25T17:30:00.000Z",
};

afterEach(cleanup);

describe("the Property panel", () => {
  it("leads with the building's type and how sure it is", () => {
    render(<PropertyResult analysis={analyzeProperty(null, SITE)} dataAsOf={SITE.dataAsOf} />);
    expect(screen.getByText("COMMERCIAL")).toBeTruthy();
    expect(screen.getByText("Confidence 90%")).toBeTruthy();
  });

  it("shows the building, its height with how it is known, its floors and footprint", () => {
    render(<PropertyResult analysis={analyzeProperty(null, SITE)} dataAsOf={SITE.dataAsOf} />);
    const facts = within(screen.getByLabelText("The building at this point"));
    expect(facts.getByText("Wave Rock Tower 2.3, office building")).toBeTruthy();
    expect(facts.getByText("About 28.8 m (9 floors × 3.2 m)")).toBeTruthy();
    expect(facts.getByText("9")).toBeTruthy();
    expect(facts.getByText("3,412 m²")).toBeTruthy();
    expect(facts.getByText("Nanakramguda Road")).toBeTruthy();
  });

  it("links the building on OpenStreetMap so anyone can check it", () => {
    render(<PropertyResult analysis={analyzeProperty(null, SITE)} dataAsOf={SITE.dataAsOf} />);
    const link = screen.getByRole("link", { name: /Wave Rock Tower 2.3 on OpenStreetMap/ });
    expect(link.getAttribute("href")).toBe("https://www.openstreetmap.org/way/630847222");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("says 'not mapped' rather than guessing a height", () => {
    const bare = { ...SITE, building: { ...SITE.building!, tags: { building: "office" } } };
    render(<PropertyResult analysis={analyzeProperty(null, bare)} dataAsOf={null} />);
    const facts = within(screen.getByLabelText("The building at this point"));
    expect(facts.getAllByText("Not mapped")).toHaveLength(2);
  });

  it("when the map does not say what a building is for, offers to add it on OpenStreetMap", () => {
    const untagged = { ...SITE, building: { ...SITE.building!, id: 358752595, url: "https://www.openstreetmap.org/way/358752595", tags: { building: "yes" } } };
    const analysis = analyzeProperty(null, untagged);
    expect(analysis.classification).toBe("Unknown");
    render(<PropertyResult analysis={analysis} dataAsOf={null} point={{ lat: 17.38342, lon: 78.46975 }} />);
    const edit = screen.getByRole("link", { name: /Add it on OpenStreetMap/ });
    expect(edit.getAttribute("href")).toBe("https://www.openstreetmap.org/edit?way=358752595");
    expect(edit.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("does not ask for what the map already says", () => {
    render(<PropertyResult analysis={analyzeProperty(null, SITE)} dataAsOf={SITE.dataAsOf} point={{ lat: SITE.lat, lon: SITE.lon }} />);
    expect(screen.queryByRole("link", { name: /Add it on OpenStreetMap/ })).toBeNull();
  });

  it("links street photos of the exact spot, to check by eye", () => {
    render(<PropertyResult analysis={analyzeProperty(null, SITE)} dataAsOf={SITE.dataAsOf} point={{ lat: 17.419687, lon: 78.347545 }} />);
    const photos = screen.getByRole("link", { name: /Street photos of this spot on Mapillary/ });
    expect(photos.getAttribute("href")).toBe("https://www.mapillary.com/app/?lat=17.419687&lng=78.347545&z=18");
  });
});
