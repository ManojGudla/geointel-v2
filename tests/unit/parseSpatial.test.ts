// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ImportError, MAX_FEATURES, csvRows, parseSpatialFile, parseWkt, summarise, viewFor } from "../../src/features/import/parseSpatial";

const message = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ImportError);
    return (e as Error).message;
  }
  throw new Error("expected an ImportError");
};

describe("GeoJSON import", () => {
  it("reads a FeatureCollection, a single Feature and a bare geometry", () => {
    const fc = parseSpatialFile("a.geojson", JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "Site A" }, geometry: { type: "Point", coordinates: [78.35, 17.44, 520] } }] }));
    expect(fc.features).toHaveLength(1);
    // Altitude is dropped; the map is flat.
    expect(fc.features[0]!.geometry).toEqual({ type: "Point", coordinates: [78.35, 17.44] });
    expect(fc.features[0]!.properties).toEqual({ name: "Site A" });
    expect(parseSpatialFile("b.json", JSON.stringify({ type: "Feature", properties: null, geometry: { type: "LineString", coordinates: [[78, 17], [78.1, 17.1]] } })).features).toHaveLength(1);
    expect(parseSpatialFile("c.geojson", JSON.stringify({ type: "Point", coordinates: [78, 17] })).features).toHaveLength(1);
  });

  it("skips features with no usable geometry and counts them", () => {
    const out = parseSpatialFile("a.geojson", JSON.stringify({ type: "FeatureCollection", features: [
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [78.35, 17.44] } },
      { type: "Feature", properties: {}, geometry: null },
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: ["x", "y"] } },
      { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[78, 17], [78.1, 17]]] } },
    ] }));
    expect(out.features).toHaveLength(1);
    expect(out.skipped).toBe(3);
  });

  it("closes an open polygon ring instead of rejecting it", () => {
    const out = parseSpatialFile("a.geojson", JSON.stringify({ type: "Polygon", coordinates: [[[78, 17], [78.1, 17], [78.1, 17.1]]] }));
    const ring = (out.features[0]!.geometry as GeoJSON.Polygon).coordinates[0]!;
    expect(ring).toHaveLength(4);
    expect(ring[3]).toEqual(ring[0]);
  });

  it("refuses a projected coordinate system and says what to do", () => {
    const utm = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [234567.8, 1929876.5] } }] });
    expect(message(() => parseSpatialFile("utm.geojson", utm))).toMatch(/WGS 84 \(EPSG:4326\)/);
    const named = JSON.stringify({ type: "FeatureCollection", crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::32644" } }, features: [] });
    expect(message(() => parseSpatialFile("named.geojson", named))).toMatch(/EPSG::32644/);
  });

  it("gives a plain reason for broken or empty files", () => {
    expect(message(() => parseSpatialFile("a.geojson", "{not json"))).toMatch(/not valid JSON/);
    expect(message(() => parseSpatialFile("a.geojson", "   "))).toMatch(/empty/);
    expect(message(() => parseSpatialFile("a.geojson", JSON.stringify({ type: "FeatureCollection", features: [] })))).toMatch(/no features/);
    expect(message(() => parseSpatialFile("a.geojson", JSON.stringify({ hello: 1 })))).toMatch(/does not contain GeoJSON/);
  });

  it("turns nested property values into text and drops reserved keys", () => {
    const out = parseSpatialFile("a.geojson", JSON.stringify({ type: "Feature", properties: { n: 3, tags: { a: 1 }, __color: "red", empty: null }, geometry: { type: "Point", coordinates: [78, 17] } }));
    expect(out.features[0]!.properties).toEqual({ n: 3, tags: '{"a":1}' });
  });

  it("refuses more features than the map can draw smoothly", () => {
    const features = Array.from({ length: MAX_FEATURES + 1 }, () => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [78, 17] } }));
    expect(message(() => parseSpatialFile("big.geojson", JSON.stringify({ type: "FeatureCollection", features })))).toMatch(/limit is 20,000/);
  });
});

describe("KML import", () => {
  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <Placemark><name>Gate 1</name><description><![CDATA[<b>Main</b> gate<script>alert(1)</script>]]></description>
      <ExtendedData><Data name="status"><value>approved</value></Data></ExtendedData>
      <Point><coordinates>78.3489,17.4401,0</coordinates></Point></Placemark>
    <Placemark><name>Boundary</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
      78.34,17.44,0 78.35,17.44,0 78.35,17.45,0 78.34,17.44,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    <Placemark><name>Road</name><LineString><coordinates>78.34,17.44 78.36,17.46</coordinates></LineString></Placemark>
    <Placemark><name>No shape</name></Placemark>
  </Document></kml>`;

  it("reads points, lines and polygons with their names and data", () => {
    const out = parseSpatialFile("site.kml", kml);
    expect(out.features.map((f) => f.geometry.type)).toEqual(["Point", "Polygon", "LineString"]);
    expect(out.skipped).toBe(1);
    expect(out.features[0]!.properties).toMatchObject({ name: "Gate 1", status: "approved" });
  });

  it("keeps a description as plain text, with markup stripped", () => {
    const description = String(parseSpatialFile("site.kml", kml).features[0]!.properties!.description);
    expect(description).toContain("Main gate");
    expect(description).not.toMatch(/[<>]/);
  });

  it("explains a KML with nothing in it, or that is not XML", () => {
    expect(message(() => parseSpatialFile("a.kml", "<kml><Document></Document></kml>"))).toMatch(/no placemarks/);
    expect(message(() => parseSpatialFile("a.kml", "<kml><Document>"))).toMatch(/not valid XML/);
  });
});

describe("CSV import", () => {
  it("finds latitude and longitude columns by their usual names", () => {
    const out = parseSpatialFile("sites.csv", "Name,Latitude,Longitude,Status\nTower A,17.4401,78.3489,approved\nTower B,17.45,78.36,pending\n");
    expect(out.features).toHaveLength(2);
    expect(out.features[0]!.geometry).toEqual({ type: "Point", coordinates: [78.3489, 17.4401] });
    expect(out.features[0]!.properties).toMatchObject({ Name: "Tower A", Status: "approved" });
  });

  it("skips rows without coordinates and counts them", () => {
    const out = parseSpatialFile("sites.csv", "name,lat,lng\nA,17.44,78.34\nB,,\nC,abc,def\nD,17.5,78.4\n");
    expect(out.features).toHaveLength(2);
    expect(out.skipped).toBe(2);
  });

  it("handles quoted values with commas, semicolon files and a byte-order mark", () => {
    expect(csvRows('a,"b, with comma","say ""hi"""\n', ",")).toEqual([["a", "b, with comma", 'say "hi"']]);
    const semi = parseSpatialFile("eu.csv", "﻿name;lat;lon\nA;17,44;78,34\nB;17.44;78.34\n");
    expect(semi.features).toHaveLength(1);
  });

  it("reads a WKT column", () => {
    const out = parseSpatialFile("wkt.csv", 'id,wkt\n1,"POINT (78.34 17.44)"\n2,"POLYGON ((78.34 17.44, 78.35 17.44, 78.35 17.45, 78.34 17.44))"\n3,"LINESTRING (78.34 17.44, 78.36 17.46)"\n');
    expect(out.features.map((f) => f.geometry.type)).toEqual(["Point", "Polygon", "LineString"]);
    expect(parseWkt("CIRCLE (1 2)")).toBeNull();
  });

  it("says which columns it found when none hold a position", () => {
    expect(message(() => parseSpatialFile("x.csv", "name,city\nA,Hyderabad\n"))).toMatch(/no position columns.*name, city/s);
  });

  it("recognises projected coordinates in a CSV", () => {
    expect(message(() => parseSpatialFile("utm.csv", "name,x,y\nA,234567,1929876\n"))).toMatch(/WGS 84/);
  });
});

describe("file types", () => {
  it("names the formats it reads, and says so for the ones it does not yet", () => {
    expect(message(() => parseSpatialFile("parcels.zip", "PK"))).toMatch(/not supported yet.*GeoJSON or KML/s);
    expect(message(() => parseSpatialFile("photo.png", "x"))).toMatch(/GeoJSON.*KML.*CSV/s);
  });
});

describe("summary and view", () => {
  it("counts by shape, finds the bounding box and lists fields", () => {
    const { features } = parseSpatialFile("sites.csv", "name,lat,lon\nA,17.40,78.30\nB,17.50,78.40\n");
    const s = summarise(features);
    expect(s).toMatchObject({ points: 2, lines: 0, polygons: 0, bbox: [78.3, 17.4, 78.4, 17.5] });
    expect(s.fields).toContain("name");
    const view = viewFor(s.bbox);
    expect(view.center[0]).toBeCloseTo(78.35, 5);
    expect(view.center[1]).toBeCloseTo(17.45, 5);
    expect(view.zoom).toBeGreaterThan(9);
    expect(view.zoom).toBeLessThan(13);
  });

  it("does not zoom in absurdly far on a single point", () => {
    expect(viewFor([78.3, 17.4, 78.3, 17.4]).zoom).toBeLessThanOrEqual(17);
  });
});
