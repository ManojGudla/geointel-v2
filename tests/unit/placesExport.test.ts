import { describe, expect, it } from "vitest";
import { EXPORT_SOURCE, csvCell, exportFileName, placesToCsv, placesToGeoJson } from "../../src/features/export/placesExport";

const places = [
  { id: "node/1", name: "Care Hospital", category: "hospitals", lat: 17.44012345, lon: 78.34891234, distanceMeters: 412.6 },
  { id: "node/2", name: 'Dr. "Rao", Clinic', category: "hospitals", lat: 17.45, lon: 78.35, distanceMeters: 980 },
];

describe("CSV export", () => {
  it("writes a header and one row per place, with rounded numbers", () => {
    const rows = placesToCsv(places).replace(/^﻿/, "").trim().split("\r\n");
    expect(rows[0]).toBe("name,category,latitude,longitude,distance_m,osm_id,source");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toContain("Care Hospital,hospitals,17.440123,78.348912,413,node/1,");
  });

  it("quotes values that contain commas or quotes", () => {
    expect(csvCell('Dr. "Rao", Clinic')).toBe('"Dr. ""Rao"", Clinic"');
  });

  it("stops a place name being run as a spreadsheet formula", () => {
    // Names come from a map anyone can edit.
    expect(csvCell("=HYPERLINK(\"http://x\")")).toMatch(/^"?'=/);
    expect(csvCell("+91 98765")).toBe("'+91 98765");
    expect(csvCell("@home")).toBe("'@home");
    // Numbers are numbers, including negative longitudes.
    expect(csvCell(-78.5)).toBe("-78.5");
  });

  it("carries the OpenStreetMap credit on every row", () => {
    const rows = placesToCsv(places).trim().split("\r\n").slice(1);
    for (const row of rows) expect(row).toContain("OpenStreetMap contributors");
  });

  it("starts with a byte-order mark so Excel reads names in other scripts", () => {
    expect(placesToCsv(places).charCodeAt(0)).toBe(0xfeff);
  });
});

describe("GeoJSON export", () => {
  const parsed = JSON.parse(placesToGeoJson(places, { title: "Hospitals near Gachibowli", origin: { lat: 17.44, lon: 78.35 }, radiusMeters: 1500 }));

  it("is a FeatureCollection of points, longitude first", () => {
    expect(parsed.type).toBe("FeatureCollection");
    expect(parsed.features).toHaveLength(2);
    expect(parsed.features[0].geometry).toEqual({ type: "Point", coordinates: [78.348912, 17.440123] });
    expect(parsed.features[0].properties).toEqual({ name: "Care Hospital", category: "hospitals", distance_m: 413, osm_id: "node/1" });
  });

  it("carries the credit and where the search was made from", () => {
    expect(parsed.attribution).toBe(EXPORT_SOURCE);
    expect(parsed.searchedFrom).toEqual({ latitude: 17.44, longitude: 78.35, radiusMeters: 1500 });
  });
});

describe("file names", () => {
  it("are made from the title and the date", () => {
    expect(exportFileName("Hospitals near Gachibowli!", "csv", new Date(2026, 10, 11))).toBe("hospitals-near-gachibowli-2026-11-11.csv");
    expect(exportFileName("", "geojson", new Date(2026, 0, 5))).toBe("places-2026-01-05.geojson");
  });
});
