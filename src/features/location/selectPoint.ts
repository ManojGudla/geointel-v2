import { reverseGeocode } from "@/services/geocode";
import { useLocationStore } from "@/stores/locationStore";
import type { Location } from "@/types/location";

/**
 * Turns a raw {lat, lon} — from a map click, a pasted coordinate, a "use my
 * location" press — into a real selected location.
 *
 * Why this exists as one shared function: clicking the map used to open a
 * small separate "Property information" card (PoiInspector) that was NOT
 * the selected location. So a click gave you a second, weaker panel while
 * the real Explore panel — identity, intelligence score, property analysis,
 * layers, radius, AI context, reports — stayed empty and pointed at whatever
 * you had searched for before. Two rival surfaces answering the same
 * question, which is exactly the confusion the whole UI pass has been
 * removing. Now a click goes down the same path a search does, and the one
 * Explore panel is always the answer.
 *
 * Failure is honest rather than silent. If the reverse geocode fails or the
 * spot genuinely has no named place (open sea, desert, unmapped land), the
 * location is still selected using its coordinates, with `source` recording
 * what actually happened — the map never swallows a click.
 */

/** Formats a coordinate the way the rest of the app prints them. */
export function coordinateLabel(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

/**
 * A location built from coordinates alone, used when no place name exists
 * or the lookup failed. Named explicitly so the UI can say "Dropped pin"
 * rather than pretending it resolved an address it never got.
 */
export function coordinateOnlyLocation(lat: number, lon: number, source: string): Location {
  return {
    lat,
    lon,
    displayName: coordinateLabel(lat, lon),
    name: "Dropped pin",
    address: {},
    source,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * Selects the point immediately with a coordinate-only location, then
 * upgrades it in place once the reverse geocode returns.
 *
 * The immediate write is the important half: a click has to move the marker
 * and open the panel in the same frame it happens, or it reads as a dead
 * click on a slow connection. Nominatim can take a second or more, and on a
 * bad network it can take ten — nobody waits that long to find out whether
 * their click registered.
 */
export async function selectMapPoint(
  lat: number,
  lon: number,
  signal?: AbortSignal,
  /*
    How this point came to be selected, recorded on the location so the app
    can say where it got it. A map click is no longer the only caller: the
    quick actions now select the centre of the current view when nothing has
    been chosen yet, and labelling that "Map click" would be a small lie in
    the one field whose whole job is provenance.
  */
  source = "Map click"
): Promise<void> {
  const { setSelectedLocation } = useLocationStore.getState();
  setSelectedLocation(coordinateOnlyLocation(lat, lon, source));

  try {
    const located = await reverseGeocode(lat, lon, signal);
    if (signal?.aborted) return;
    // Only replace it if the user hasn't clicked somewhere else since. An
    // in-flight lookup from a previous click must never overwrite a newer
    // selection — that's how a marker ends up labelled with the wrong place.
    const current = useLocationStore.getState().selectedLocation;
    if (!current || current.lat !== lat || current.lon !== lon) return;
    setSelectedLocation(located);
  } catch {
    if (signal?.aborted) return;
    const current = useLocationStore.getState().selectedLocation;
    if (!current || current.lat !== lat || current.lon !== lon) return;
    // Keep the pin. Say plainly that no name came back rather than leaving
    // the earlier source implying a successful lookup.
    setSelectedLocation(coordinateOnlyLocation(lat, lon, `${source} · no address found for this point`));
  }
}
