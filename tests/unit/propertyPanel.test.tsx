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
});
