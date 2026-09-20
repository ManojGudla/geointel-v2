import { createRng } from "../../lib/random";
import { CHANGE_SITES, type ChangeSite } from "./changeSites";
import { GIBS_LAYERS } from "@/features/timeline/gibs";

/**
 * Spot the Change - the pure part.
 *
 * The scoring, the round order and the tile arithmetic live here with no React
 * and no network, so all of it is testable. The component only draws.
 */

export const ROUNDS_PER_GAME = 6;
export const OPTIONS_PER_ROUND = 4;
/** Tiles per side of the image grid. 3 gives roughly 768px of imagery. */
export const GRID = 3;
export const BASE_POINTS = 100;
/** Answering in the first few seconds is worth more; it never goes negative. */
export const MAX_SPEED_BONUS = 60;
export const SPEED_WINDOW_SECONDS = 20;

export interface ChangeRound {
  site: ChangeSite;
  options: string[];
  answer: string;
}

/**
 * Where a lat/lon lands in the Web Mercator tile grid at a given zoom.
 *
 * This is the standard slippy-map formula. It is here rather than pulled from
 * MapLibre because this game never creates a map: two draggable maps would let
 * a player pan away and hunt for a landmark, which is a different game. Fixed
 * images keep the question the one being asked.
 */
export function tileForLatLon(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/**
 * The GRID x GRID block of tile URLs centred on the site, for one date.
 *
 * Wrapping in x rather than clamping matters near the date line; y is clamped
 * because there is no tile above the north pole to wrap to.
 */
export function tileGrid(site: ChangeSite, date: string): string[] {
  const layer = GIBS_LAYERS.find((l) => l.id === site.layer) ?? GIBS_LAYERS[0]!;
  const zoom = Math.min(site.zoom, layer.maxZoom);
  const centre = tileForLatLon(site.lat, site.lon, zoom);
  const n = 2 ** zoom;
  const half = Math.floor(GRID / 2);

  const urls: string[] = [];
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const x = ((centre.x + dx) % n + n) % n;
      const y = Math.min(n - 1, Math.max(0, centre.y + dy));
      urls.push(
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.product}/default/${date}/GoogleMapsCompatible_Level${layer.maxZoom}/${zoom}/${y}/${x}.${layer.format}`
      );
    }
  }
  return urls;
}

/**
 * One game's worth of rounds.
 *
 * Options are shuffled, and the answer's position is therefore not fixed -
 * a constant slot is learnable in three rounds and ends the game early.
 */
export function buildChangeGame(seed: number | string, count = ROUNDS_PER_GAME): ChangeRound[] {
  const rng = createRng(seed);
  return rng.sample(CHANGE_SITES, Math.min(count, CHANGE_SITES.length)).map((site) => ({
    site,
    options: rng.shuffle([site.answer, ...site.distractors]).slice(0, OPTIONS_PER_ROUND),
    answer: site.answer,
  }));
}

/** Points for one round. Wrong is zero, never negative. */
export function changePoints(correct: boolean, secondsTaken: number): number {
  if (!correct) return 0;
  const remaining = Math.max(0, SPEED_WINDOW_SECONDS - secondsTaken);
  const bonus = Math.round((remaining / SPEED_WINDOW_SECONDS) * MAX_SPEED_BONUS);
  return BASE_POINTS + bonus;
}

/** "2000-08-15" as "August 2000", which is what a player actually reads. */
export function readableDate(iso: string): string {
  const [year, month] = iso.split("-");
  const name = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][Number(month) - 1];
  return name ? `${name} ${year}` : iso;
}

/** Whole years between the two dates, for the "N years apart" line. */
export function yearsApart(before: string, after: string): number {
  const ms = new Date(after).getTime() - new Date(before).getTime();
  return Math.max(0, Math.round(ms / (365.25 * 24 * 3600 * 1000)));
}
