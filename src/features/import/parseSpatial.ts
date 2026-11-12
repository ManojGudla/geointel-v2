/**
 * Reads a file somebody already has (GeoJSON, KML, or a CSV with coordinates)
 * into GeoJSON features the map can draw.
 *
 * Everything happens in the browser. The file is never uploaded: there is no
 * server step here at all, which is also why a confidential site list is safe
 * to open.
 *
 * Two rules run through all three formats:
 *
 *  1. Never pretend. A row or feature that cannot be placed on the map is
 *     counted in `skipped` and reported; a file with nothing usable is an
 *     error with a sentence that says what was wrong, not an empty layer.
 *  2. Coordinates must be longitude/latitude in degrees (WGS 84). A file in a
 *     projected system (metres, UTM, a state grid) would land in the ocean off
 *     Africa or not at all, so numbers outside the possible range are treated
 *     as "wrong coordinate system" and said so, rather than drawn wrongly.
 *
 * Pure functions, tested in tests/unit/parseSpatial.test.ts.
 */

export type SpatialFormat = "geojson" | "kml" | "csv";

export interface ParsedSpatial {
  format: SpatialFormat;
  features: GeoJSON.Feature[];
  /** Rows or features left out because they had no usable position. */
  skipped: number;
}

/** A problem the person can do something about. `message` is shown as written. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

/** Beyond this a browser tab starts to stutter when the map redraws. */
export const MAX_FEATURES = 20_000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function formatFromName(fileName: string): SpatialFormat | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "geojson" || ext === "json") return "geojson";
  if (ext === "kml") return "kml";
  if (ext === "csv" || ext === "tsv" || ext === "txt") return "csv";
  return null;
}

export function parseSpatialFile(fileName: string, text: string): ParsedSpatial {
  const format = formatFromName(fileName);
  if (!format) {
    const ext = fileName.includes(".") ? `.${fileName.split(".").pop()}` : "This file type";
    if (/\.(zip|shp|kmz)$/i.test(fileName)) {
      throw new ImportError(`${ext} files are not supported yet. Export the layer as GeoJSON or KML and add that instead.`);
    }
    throw new ImportError(`${ext} is not a file type this can read. Use GeoJSON (.geojson, .json), KML (.kml) or CSV (.csv).`);
  }
  if (text.trim() === "") throw new ImportError("This file is empty.");

  const parsed = format === "geojson" ? parseGeoJson(text) : format === "kml" ? parseKml(text) : parseCsv(text);

  if (parsed.features.length === 0) {
    throw new ImportError(
      parsed.skipped > 0
        ? `None of the ${parsed.skipped} records in this file has a usable position, so there is nothing to draw.`
        : "This file has no features to draw."
    );
  }
  if (parsed.features.length > MAX_FEATURES) {
    throw new ImportError(
      `This file has ${parsed.features.length.toLocaleString("en-IN")} features. The limit is ${MAX_FEATURES.toLocaleString("en-IN")}, so the map stays responsive. Split it or filter it first.`
    );
  }
  return parsed;
}

/* ── Coordinates ─────────────────────────────────────────────────────────── */

const WRONG_SYSTEM =
  "The coordinates in this file are not longitude and latitude in degrees. It is probably in a projected coordinate system (metres). Re-export it as WGS 84 (EPSG:4326) and try again.";

type Position = [number, number];

/** A valid [lon, lat], or null. Extra values (altitude) are dropped. */
function position(value: unknown): Position | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return [lon, lat];
}

/** True when a pair is numeric but cannot be degrees: the sign of a projected file. */
function looksProjected(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 2) return false;
  const x = Number(value[0]);
  const y = Number(value[1]);
  return Number.isFinite(x) && Number.isFinite(y) && (Math.abs(x) > 180 || Math.abs(y) > 90);
}

function line(value: unknown, min: number): Position[] | null {
  if (!Array.isArray(value)) return null;
  const out: Position[] = [];
  for (const item of value) {
    const p = position(item);
    if (!p) return null;
    out.push(p);
  }
  return out.length >= min ? out : null;
}

function polygon(value: unknown): Position[][] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rings: Position[][] = [];
  for (const ring of value) {
    const r = line(ring, 3);
    if (!r) return null;
    // Close an open ring rather than reject it; many exporters leave it open.
    const [first, last] = [r[0]!, r[r.length - 1]!];
    if (first[0] !== last[0] || first[1] !== last[1]) r.push([first[0], first[1]]);
    if (r.length < 4) return null;
    rings.push(r);
  }
  return rings;
}

/** A clean copy of a geometry with only valid positions, or null if it cannot be drawn. */
export function cleanGeometry(geometry: unknown): GeoJSON.Geometry | null {
  if (!geometry || typeof geometry !== "object") return null;
  const g = geometry as { type?: unknown; coordinates?: unknown; geometries?: unknown };
  const many = <T>(value: unknown, one: (v: unknown) => T | null): T[] | null => {
    if (!Array.isArray(value)) return null;
    const out = value.map(one).filter((v): v is T => v !== null);
    return out.length > 0 ? out : null;
  };
  switch (g.type) {
    case "Point": {
      const p = position(g.coordinates);
      return p ? { type: "Point", coordinates: p } : null;
    }
    case "MultiPoint": {
      const ps = many(g.coordinates, position);
      return ps ? { type: "MultiPoint", coordinates: ps } : null;
    }
    case "LineString": {
      const l = line(g.coordinates, 2);
      return l ? { type: "LineString", coordinates: l } : null;
    }
    case "MultiLineString": {
      const ls = many(g.coordinates, (v) => line(v, 2));
      return ls ? { type: "MultiLineString", coordinates: ls } : null;
    }
    case "Polygon": {
      const p = polygon(g.coordinates);
      return p ? { type: "Polygon", coordinates: p } : null;
    }
    case "MultiPolygon": {
      const ps = many(g.coordinates, polygon);
      return ps ? { type: "MultiPolygon", coordinates: ps } : null;
    }
    case "GeometryCollection": {
      const gs = many(g.geometries, cleanGeometry);
      return gs ? { type: "GeometryCollection", geometries: gs } : null;
    }
    default:
      return null;
  }
}

/** The first coordinate pair anywhere in a geometry, valid or not. */
function firstPair(value: unknown): unknown {
  let current = value;
  while (Array.isArray(current) && Array.isArray(current[0])) current = current[0];
  return current;
}

/** Only plain values survive: nested objects become JSON text, so a popup or table can always show them. */
function cleanProperties(props: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!props || typeof props !== "object") return out;
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (value === null || value === undefined || key.startsWith("__")) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value;
    else out[key] = JSON.stringify(value).slice(0, 500);
  }
  return out;
}

/* ── GeoJSON ─────────────────────────────────────────────────────────────── */

function parseGeoJson(text: string): ParsedSpatial {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError("This is not valid JSON, so it cannot be read as GeoJSON. Check that the file was exported completely.");
  }
  if (!data || typeof data !== "object") throw new ImportError("This JSON file does not contain GeoJSON.");
  const root = data as { type?: unknown; features?: unknown; crs?: { properties?: { name?: unknown } } };

  // Old-style GeoJSON can name another coordinate system. Only WGS 84 is drawn.
  const crsName = typeof root.crs?.properties?.name === "string" ? root.crs.properties.name : "";
  if (crsName && !/CRS84|EPSG:+4326/i.test(crsName)) {
    throw new ImportError(`This file is in the coordinate system ${crsName}. Re-export it as WGS 84 (EPSG:4326) and try again.`);
  }

  let raw: unknown[];
  if (root.type === "FeatureCollection") {
    if (!Array.isArray(root.features)) throw new ImportError("This GeoJSON FeatureCollection has no features list.");
    raw = root.features;
  } else if (root.type === "Feature") {
    raw = [root];
  } else if (typeof root.type === "string") {
    raw = [{ type: "Feature", properties: {}, geometry: root }];
  } else {
    throw new ImportError("This JSON file does not contain GeoJSON (it has no \"type\").");
  }

  const features: GeoJSON.Feature[] = [];
  let skipped = 0;
  let projected = 0;
  for (const item of raw) {
    const f = item as { geometry?: unknown; properties?: unknown } | null;
    const geometry = cleanGeometry(f?.geometry);
    if (!geometry) {
      skipped += 1;
      if (looksProjected(firstPair((f?.geometry as { coordinates?: unknown } | undefined)?.coordinates))) projected += 1;
      continue;
    }
    features.push({ type: "Feature", geometry, properties: cleanProperties(f?.properties) });
  }
  if (features.length === 0 && projected > 0) throw new ImportError(WRONG_SYSTEM);
  return { format: "geojson", features, skipped };
}

/* ── KML ─────────────────────────────────────────────────────────────────── */

function kmlCoordinates(text: string | null | undefined): unknown[] {
  return (text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tuple) => tuple.split(",").map(Number));
}

function child(parent: Element, name: string): Element | null {
  for (const node of Array.from(parent.children)) if (node.localName === name) return node;
  return null;
}

function kmlGeometry(node: Element): unknown {
  switch (node.localName) {
    case "Point":
      return { type: "Point", coordinates: kmlCoordinates(child(node, "coordinates")?.textContent)[0] };
    case "LineString":
      return { type: "LineString", coordinates: kmlCoordinates(child(node, "coordinates")?.textContent) };
    case "Polygon": {
      const ring = (boundary: Element) => kmlCoordinates(boundary.getElementsByTagNameNS("*", "coordinates")[0]?.textContent);
      const outer = child(node, "outerBoundaryIs");
      if (!outer) return null;
      const inner = Array.from(node.children).filter((n) => n.localName === "innerBoundaryIs");
      return { type: "Polygon", coordinates: [ring(outer), ...inner.map(ring)] };
    }
    case "MultiGeometry":
      return {
        type: "GeometryCollection",
        geometries: Array.from(node.children)
          .map(kmlGeometry)
          .filter((g) => g !== null),
      };
    default:
      return null;
  }
}

function parseKml(text: string): ParsedSpatial {
  // Parsed as XML data, never inserted into the page: scripts in it cannot run.
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new ImportError("This KML file is not valid XML. Check that it was exported completely.");
  }
  const placemarks = Array.from(doc.getElementsByTagNameNS("*", "Placemark"));
  if (placemarks.length === 0) throw new ImportError("This KML file has no placemarks to draw.");

  const features: GeoJSON.Feature[] = [];
  let skipped = 0;
  for (const mark of placemarks) {
    const shape = Array.from(mark.children).find((n) => ["Point", "LineString", "Polygon", "MultiGeometry"].includes(n.localName));
    const geometry = shape ? cleanGeometry(kmlGeometry(shape)) : null;
    if (!geometry) {
      skipped += 1;
      continue;
    }
    const properties: Record<string, string> = {};
    const name = child(mark, "name")?.textContent?.trim();
    const description = child(mark, "description")?.textContent?.trim();
    if (name) properties.name = name;
    // Descriptions are often HTML. Kept as plain text; never rendered as markup.
    if (description) properties.description = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
    for (const data of Array.from(mark.getElementsByTagNameNS("*", "Data"))) {
      const key = data.getAttribute("name");
      const value = child(data, "value")?.textContent?.trim();
      if (key && value && !key.startsWith("__")) properties[key] = value.slice(0, 500);
    }
    for (const data of Array.from(mark.getElementsByTagNameNS("*", "SimpleData"))) {
      const key = data.getAttribute("name");
      const value = data.textContent?.trim();
      if (key && value && !key.startsWith("__")) properties[key] = value.slice(0, 500);
    }
    features.push({ type: "Feature", geometry, properties });
  }
  return { format: "kml", features, skipped };
}

/* ── CSV ─────────────────────────────────────────────────────────────────── */

/** Quoted fields, doubled quotes, and commas or line breaks inside quotes. */
export function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

const LAT_NAMES = ["lat", "latitude", "y", "lat_dd", "ycoord"];
const LON_NAMES = ["lon", "lng", "long", "longitude", "x", "lon_dd", "xcoord"];
const WKT_NAMES = ["wkt", "geometry", "geom", "the_geom", "shape"];

/** POINT, LINESTRING and POLYGON, which is what spreadsheets of sites actually hold. */
export function parseWkt(wkt: string): unknown {
  const match = /^\s*(?:SRID=\d+;)?\s*(POINT|LINESTRING|POLYGON)\s*(?:Z|M|ZM)?\s*\((.*)\)\s*$/is.exec(wkt);
  if (!match) return null;
  const kind = match[1]!.toUpperCase();
  const pairs = (s: string) => s.split(",").map((pair) => pair.trim().split(/\s+/).map(Number));
  if (kind === "POINT") return { type: "Point", coordinates: pairs(match[2]!)[0] };
  if (kind === "LINESTRING") return { type: "LineString", coordinates: pairs(match[2]!) };
  const rings = match[2]!.match(/\(([^()]*)\)/g);
  if (!rings) return null;
  return { type: "Polygon", coordinates: rings.map((ring) => pairs(ring.slice(1, -1))) };
}

function parseCsv(text: string): ParsedSpatial {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delimiter = count("\t") > count(",") && count("\t") > count(";") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows = csvRows(text, delimiter);
  if (rows.length < 2) throw new ImportError("This CSV needs a header row and at least one row of data.");

  const header = rows[0]!.map((h) => h.trim());
  const find = (names: string[]) => header.findIndex((h) => names.includes(h.toLowerCase()));
  const latCol = find(LAT_NAMES);
  const lonCol = find(LON_NAMES);
  const wktCol = find(WKT_NAMES);
  if ((latCol < 0 || lonCol < 0) && wktCol < 0) {
    throw new ImportError(
      `This CSV has no position columns. It needs a latitude column and a longitude column (named like "lat" and "lon"), or a "wkt" column. The columns found were: ${header.slice(0, 8).join(", ")}.`
    );
  }

  const features: GeoJSON.Feature[] = [];
  let skipped = 0;
  let projected = 0;
  for (const row of rows.slice(1)) {
    let raw: unknown = null;
    if (latCol >= 0 && lonCol >= 0) {
      const lat = row[latCol]?.trim();
      const lon = row[lonCol]?.trim();
      if (lat && lon) raw = { type: "Point", coordinates: [Number(lon), Number(lat)] };
    }
    if (!raw && wktCol >= 0 && row[wktCol]) raw = parseWkt(row[wktCol]!);
    const geometry = cleanGeometry(raw);
    if (!geometry) {
      skipped += 1;
      if (looksProjected(firstPair((raw as { coordinates?: unknown } | null)?.coordinates))) projected += 1;
      continue;
    }
    const properties: Record<string, string> = {};
    header.forEach((key, i) => {
      if (i === wktCol || !key || key.startsWith("__")) return;
      const value = row[i]?.trim();
      if (value) properties[key] = value.slice(0, 500);
    });
    features.push({ type: "Feature", geometry, properties });
  }
  if (features.length === 0 && projected > 0) throw new ImportError(WRONG_SYSTEM);
  return { format: "csv", features, skipped };
}

/* ── Summary ─────────────────────────────────────────────────────────────── */

export interface SpatialSummary {
  points: number;
  lines: number;
  polygons: number;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  /** Property names, most common first, for a quick look at what the file holds. */
  fields: string[];
}

export function summarise(features: GeoJSON.Feature[]): SpatialSummary {
  let points = 0;
  let lines = 0;
  let polygons = 0;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const fieldCount = new Map<string, number>();

  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      const [lon, lat] = coords as number[];
      west = Math.min(west, lon!);
      east = Math.max(east, lon!);
      south = Math.min(south, lat!);
      north = Math.max(north, lat!);
      return;
    }
    for (const part of coords) visit(part);
  };
  const tally = (g: GeoJSON.Geometry): void => {
    if (g.type === "GeometryCollection") return g.geometries.forEach(tally);
    if (g.type === "Point" || g.type === "MultiPoint") points += 1;
    else if (g.type === "LineString" || g.type === "MultiLineString") lines += 1;
    else polygons += 1;
    visit(g.coordinates);
  };

  for (const f of features) {
    tally(f.geometry);
    for (const key of Object.keys(f.properties ?? {})) fieldCount.set(key, (fieldCount.get(key) ?? 0) + 1);
  }
  const fields = [...fieldCount.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  return { points, lines, polygons, bbox: [west, south, east, north], fields };
}

/** A centre and zoom that shows the whole box. The map's camera takes these, not bounds. */
export function viewFor(bbox: [number, number, number, number]): { center: [number, number]; zoom: number } {
  const [west, south, east, north] = bbox;
  const center: [number, number] = [(west + east) / 2, (south + north) / 2];
  const span = Math.max(east - west, (north - south) * 1.6, 0.0005);
  // 360 degrees fills the world at zoom 0 on a ~512px tile; one less for margin.
  const zoom = Math.max(2, Math.min(17, Math.log2(360 / span) - 0.8));
  return { center, zoom: Math.round(zoom * 10) / 10 };
}
