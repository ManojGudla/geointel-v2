import { useEffect, useRef } from "react";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";

/**
 * The map the geo games are played on.
 *
 * Deliberately its own small MapLibre instance rather than the app's main
 * map: a game must not move the user's real map, drop pins on it, or lose
 * their layers and analysis. Closing the hub leaves the workspace exactly as
 * they left it, which is the whole promise the hub makes.
 *
 * It also has to be LABEL-FREE. A geography game rendered on a basemap that
 * prints "Hyderabad" next to the answer isn't a game. Both styles below are
 * imagery/terrain only, with no place names, no boundaries and no roads -
 * which is why they're defined here rather than reusing the app's basemaps,
 * where labels are the point.
 */

const NO_LABEL_SATELLITE: StyleSpecification = {
  version: 8,
  sources: {
    imagery: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "imagery", type: "raster", source: "imagery" }],
};

/**
 * Esri's Dark Gray Canvas BASE layer, without the reference (labels) overlay
 * the main app pairs it with - landmasses and coastlines, no names. Exactly
 * what a "point at where you think this is" game needs.
 */
const NO_LABEL_WORLD: StyleSpecification = {
  version: 8,
  sources: {
    base: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
      attribution: "© Esri, HERE, Garmin, © OpenStreetMap contributors",
    },
  },
  layers: [{ id: "base", type: "raster", source: "base" }],
};

export type GameMapStyle = "satellite" | "world";

export interface GameMapPin {
  lat: number;
  lon: number;
  /** "guess" is where the player clicked; "answer" is the truth. */
  kind: "guess" | "answer";
  label?: string;
}

interface Props {
  style: GameMapStyle;
  center: [number, number];
  zoom: number;
  /** Off while showing an answer, so a player can't move their guess after. */
  interactive: boolean;
  pins: GameMapPin[];
  /** Drawn between the guess and the answer when both are present. */
  showConnector?: boolean;
  onPick?: (lat: number, lon: number) => void;
  ariaLabel: string;
}

const LINE_SOURCE = "play-connector";

function pinElement(kind: GameMapPin["kind"], label?: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `play-pin play-pin--${kind}`;
  el.textContent = kind === "guess" ? "📍" : "🎯";
  if (label) el.title = label;
  return el;
}

export function GameMap({ style, center, zoom, interactive, pins, showConnector, onPick, ariaLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const readyRef = useRef(false);
  // Held in a ref so changing the handler never re-creates the map, which
  // would reset the player's view mid-round.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: style === "satellite" ? NO_LABEL_SATELLITE : NO_LABEL_WORLD,
      center,
      zoom,
      attributionControl: { compact: true },
      // A game map is a target, not a viewport to fly around in 3D.
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: true,
    });

    // Same fix as the main map: a canvas constructed at 0x0 (the hub sheet
    // animating in, a phone settling its viewport) renders once and never
    // repaints without this.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.on("load", () => {
      readyRef.current = true;
      map.resize();
      map.addSource(LINE_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: LINE_SOURCE,
        type: "line",
        source: LINE_SOURCE,
        layout: { "line-cap": "round" },
        paint: { "line-color": "#ffcc4d", "line-width": 2.5, "line-dasharray": [2, 2] },
      });
    });

    map.on("click", (e) => {
      onPickRef.current?.(e.lngLat.lat, e.lngLat.lng);
    });

    mapRef.current = map;
    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // Style is fixed for the lifetime of a game; center/zoom are the INITIAL
    // camera and are driven afterwards by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  // Interactivity is toggled rather than remounting the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handlers = [map.dragPan, map.scrollZoom, map.doubleClickZoom, map.touchZoomRotate, map.keyboard];
    for (const h of handlers) interactive ? h.enable() : h.disable();
    map.getCanvas().style.cursor = interactive && onPickRef.current ? "crosshair" : "";
  }, [interactive]);

  // Camera: driven from props so a round change can reframe the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.jumpTo({ center, zoom });
    // center is a tuple recreated each render; comparing its contents avoids
    // a jump on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], zoom]);

  // Pins + connector line.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = pins.map((p) =>
      new maplibregl.Marker({ element: pinElement(p.kind, p.label), anchor: "bottom" })
        .setLngLat([p.lon, p.lat])
        .addTo(map)
    );

    const draw = () => {
      const source = map.getSource(LINE_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      const guess = pins.find((p) => p.kind === "guess");
      const answer = pins.find((p) => p.kind === "answer");
      const features =
        showConnector && guess && answer
          ? [
              {
                type: "Feature" as const,
                properties: {},
                geometry: {
                  type: "LineString" as const,
                  coordinates: [
                    [guess.lon, guess.lat],
                    [answer.lon, answer.lat],
                  ],
                },
              },
            ]
          : [];
      source.setData({ type: "FeatureCollection", features });
    };

    if (readyRef.current) draw();
    else map.once("load", draw);
  }, [pins, showConnector]);

  return <div ref={containerRef} className="play-map" role="application" aria-label={ariaLabel} />;
}
