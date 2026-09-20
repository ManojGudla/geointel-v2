/**
 * The minimal slice of MapLibre's Map API this needs - a plain structural
 * interface rather than maplibre-gl's own Map type, so this stays a small,
 * dependency-free unit that's trivial to unit test without a real map or
 * WebGL context involved at all.
 */
export type SourceReadyEvent = "load" | "styledata";

export interface SourceReadyMap {
  getSource(id: string): unknown;
  on(event: SourceReadyEvent, handler: () => void): unknown;
  off(event: SourceReadyEvent, handler: () => void): unknown;
}

/**
 * Runs `run()` as soon as the named GeoJSON source actually exists on the
 * map - immediately if it's already there, otherwise on the next map event
 * that could have created it.
 *
 * The events matter, and the obvious choices are both wrong:
 *
 * - "load" is a ONE-TIME event that fires during the map's initial
 *   construction. Every call that arrives after that - essentially all of
 *   them - would be waiting on an event that can never fire again. It's kept
 *   here only for the genuine case it does cover: a call landing before the
 *   map has ever finished loading.
 *
 * - "style.load" looks like the right answer for a basemap swap and is not.
 *   MapLibre's setStyle() defaults to diffing the new style against the
 *   current one and mutating the EXISTING Style object in place; "style.load"
 *   is fired only when a Style is constructed and loaded from scratch, so a
 *   basemap switch never emits it. Listening for it is waiting on an event
 *   that by construction does not arrive. (This function used to do exactly
 *   that, and MapView's basemap effect made the same mistake - see the long
 *   note there. It's the reason overlays disappeared after a basemap change.)
 *
 * "styledata" is the event that actually fires on every style change,
 * diffed or rebuilt. It fires more often than strictly needed - including
 * for changes that have nothing to do with this source - which is why the
 * handler re-checks getSource() before running and only detaches once the
 * source is genuinely present. Waiting one event too long is harmless; the
 * failure mode being fixed here is waiting forever.
 */
export function whenSourceReady(map: SourceReadyMap, sourceId: string, run: () => void): void {
  if (map.getSource(sourceId)) {
    run();
    return;
  }
  const handler = () => {
    if (!map.getSource(sourceId)) return;
    map.off("load", handler);
    map.off("styledata", handler);
    run();
  };
  map.on("load", handler);
  map.on("styledata", handler);
}
