/**
 * Turns a list of places on screen into a file somebody can open elsewhere:
 * CSV for a spreadsheet, GeoJSON for QGIS, ArcGIS, geojson.io or code.
 *
 * Pure functions, so the format is tested rather than eyeballed. The download
 * itself is the one impure line at the bottom.
 *
 * The data is OpenStreetMap's, under the ODbL, which asks that the credit
 * travels with it. Both formats carry it: a column in the CSV, a top-level
 * member in the GeoJSON.
 */

export interface ExportPlace {
  id?: string;
  name: string;
  category?: string;
  lat: number;
  lon: number;
  distanceMeters?: number;
}

export interface ExportMeta {
  /** What the list is, in a few words: "Hospitals near Gachibowli". */
  title: string;
  origin?: { lat: number; lon: number };
  radiusMeters?: number;
}

export const EXPORT_SOURCE = "© OpenStreetMap contributors (ODbL), exported from maNOWj GeoIntel";

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * One CSV cell.
 *
 * Two things to get right. Quoting: a comma, quote or line break inside a
 * value has to be wrapped and its quotes doubled. And formulas: place names
 * come from a public map anyone can edit, and a spreadsheet will run a cell
 * that starts with = + - or @ as a formula, so text cells that start that way
 * are prefixed with an apostrophe, which spreadsheets show as plain text.
 */
export function csvCell(value: string | number | undefined): string {
  if (value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function placesToCsv(places: ExportPlace[]): string {
  const header = ["name", "category", "latitude", "longitude", "distance_m", "osm_id", "source"];
  const rows = places.map((p) =>
    [
      csvCell(p.name),
      csvCell(p.category),
      csvCell(round(p.lat, 6)),
      csvCell(round(p.lon, 6)),
      csvCell(p.distanceMeters === undefined ? undefined : Math.round(p.distanceMeters)),
      csvCell(p.id),
      csvCell(EXPORT_SOURCE),
    ].join(",")
  );
  // CRLF and a leading BOM: what Excel needs to read UTF-8 names correctly.
  return `﻿${[header.join(","), ...rows].join("\r\n")}\r\n`;
}

export function placesToGeoJson(places: ExportPlace[], meta: ExportMeta): string {
  const collection = {
    type: "FeatureCollection",
    name: meta.title,
    attribution: EXPORT_SOURCE,
    ...(meta.origin
      ? { searchedFrom: { latitude: round(meta.origin.lat, 6), longitude: round(meta.origin.lon, 6), radiusMeters: meta.radiusMeters } }
      : {}),
    features: places.map((p) => ({
      type: "Feature",
      // GeoJSON order is longitude first.
      geometry: { type: "Point", coordinates: [round(p.lon, 6), round(p.lat, 6)] },
      properties: {
        name: p.name,
        ...(p.category ? { category: p.category } : {}),
        ...(p.distanceMeters === undefined ? {} : { distance_m: Math.round(p.distanceMeters) }),
        ...(p.id ? { osm_id: p.id } : {}),
      },
    })),
  };
  return `${JSON.stringify(collection, null, 2)}\n`;
}

/** "Hospitals near Gachibowli" on 11 Nov 2026 -> "hospitals-near-gachibowli-2026-11-11.csv". */
export function exportFileName(title: string, extension: "csv" | "geojson", now: Date = new Date()): string {
  const slug =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "places";
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${slug}-${day}.${extension}`;
}

export function downloadText(fileName: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // After the click has been handled; revoking in the same tick cancels the download in Safari.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
