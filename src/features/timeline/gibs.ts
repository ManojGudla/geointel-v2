/**
 * NASA GIBS dated satellite imagery.
 *
 * What this is and — just as importantly — what it isn't. GIBS serves global
 * satellite imagery as map tiles, keyless and free, with a date in the URL,
 * daily from February 2000 to a couple of days ago. That makes a real
 * historical timeline possible without a paid imagery archive.
 *
 * The resolution is 250 m per pixel. So this shows reservoirs filling and
 * emptying, coastlines moving, vegetation and snow coming and going, large
 * urban expansion over years, smoke and dust. It does NOT show individual
 * new buildings or new streets — at 250 m a city block is one pixel. High
 * resolution historical imagery exists and costs money; presenting a 250 m
 * product as if it showed building-level change would be the kind of
 * overclaim this project doesn't make, so the UI says the resolution out
 * loud next to the slider.
 */

/** Layers chosen for a global, daily, no-key record that goes back far enough to be interesting. */
export interface GibsLayer {
  id: string;
  label: string;
  /** GIBS layer identifier. */
  product: string;
  /** Tile format the product is published in. */
  format: "jpg" | "png";
  /** Deepest zoom GIBS publishes for this product; beyond it, tiles 404. */
  maxZoom: number;
  blurb: string;
}

export const GIBS_LAYERS: GibsLayer[] = [
  {
    id: "truecolor",
    label: "True colour",
    product: "MODIS_Terra_CorrectedReflectance_TrueColor",
    format: "jpg",
    maxZoom: 9,
    blurb: "What the satellite sees: land, water, cloud, smoke and dust.",
  },
  {
    id: "falsecolor",
    label: "Vegetation & water",
    product: "MODIS_Terra_CorrectedReflectance_Bands721",
    format: "jpg",
    maxZoom: 9,
    blurb: "False colour. Vegetation reads bright green, water dark, burn scars red-brown — change is far easier to see than in true colour.",
  },
];

/** Earliest date MODIS Terra imagery exists for. */
export const GIBS_EARLIEST = "2000-02-24";

/**
 * GIBS publishes a day's global mosaic after that day has finished
 * processing, so the last day or two is routinely missing. Asking for
 * "today" returns blank tiles, which looks exactly like a broken layer —
 * so the slider's own upper bound is three days back.
 */
export function gibsLatestDate(now: Date = new Date()): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - 3);
  return date.toISOString().slice(0, 10);
}

export function buildGibsTileUrl(layer: GibsLayer, date: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.product}/default/${date}/GoogleMapsCompatible_Level${layer.maxZoom}/{z}/{y}/{x}.${layer.format}`;
}

/** Clamps a date string into the range GIBS actually has imagery for. */
export function clampGibsDate(date: string, now: Date = new Date()): string {
  const latest = gibsLatestDate(now);
  if (date < GIBS_EARLIEST) return GIBS_EARLIEST;
  if (date > latest) return latest;
  return date;
}

/** Slider positions: one per year, plus the newest available date at the far right. */
export function timelineStops(now: Date = new Date()): string[] {
  const latest = gibsLatestDate(now);
  const latestYear = Number(latest.slice(0, 4));
  const stops: string[] = [];
  // Fifteen years is enough to show real change without making each slider
  // step so small that it's hard to land on one.
  for (let year = latestYear - 14; year <= latestYear - 1; year += 1) {
    // Mid-year, and in the dry season for much of South Asia — a date chosen
    // at random lands on cloud often enough to look like a broken layer.
    stops.push(`${year}-02-15`);
  }
  stops.push(latest);
  return stops;
}
