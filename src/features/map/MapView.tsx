import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import maplibregl, { Map as MapLibreMap, Marker, NavigationControl, FullscreenControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildBasemapStyle } from "./basemaps";
import { circlePolygon } from "./geo";
import { useMapStore } from "@/stores/mapStore";
import { useLocationStore } from "@/stores/locationStore";
import { useGisEvidence } from "@/features/gis/useGisEvidence";
import { useGisUiStore } from "@/stores/gisUiStore";
import { bucketFeature, LAYER_DEFS, pickVisibleLayer } from "@/features/gis/layerBuckets";
import { useRoute } from "@/features/routing/useRoute";
import { useRouteStore } from "@/stores/routeStore";
import { useNavigationStore } from "@/features/routing/navigation/navStore";
import { selectMapPoint } from "@/features/location/selectPoint";
import { useBuildings3D } from "./useBuildings3D";
import { buildingsToGeoJSON } from "./buildings3d";
import { useMeasureStore } from "@/stores/measureStore";
import { buildMeasureGeoJSON } from "@/features/measure/measureGeo";
import { useAnalysisStore } from "@/stores/analysisStore";
import { analysisToGeoJSON } from "@/features/analysis/analysisGeo";
import { useLiveLayerStore } from "@/stores/liveLayerStore";
import { useEarthquakes, useRadarFrame } from "@/features/live/useLiveLayers";
import { earthquakesToGeoJSON } from "@/features/live/liveGeo";
import { useTimelineStore } from "@/stores/timelineStore";
import { buildGibsTileUrl, GIBS_LAYERS } from "@/features/timeline/gibs";
import { whenSourceReady } from "./whenSourceReady";
import { MapLoadState, type MapLoadPhase } from "./MapLoadState";
import "./MapView.css";

// How long before we stop pretending everything is normal. Under a second is
// a normal load on a decent connection; past SLOW_AFTER_MS the user deserves
// to be told it is slow AND given a way out, and past FAIL_AFTER_MS calling
// it "loading" is no longer honest.
const SLOW_AFTER_MS = 6_000;
const FAIL_AFTER_MS = 20_000;

const MARKER_SOURCE = "geointel-radius";
const MARKER_LAYER_FILL = "geointel-radius-fill";
const MARKER_LAYER_LINE = "geointel-radius-line";
const OSM_DATA_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const GIS_SOURCE = "geointel-gis-features";
const GIS_LAYER_POINTS = "geointel-gis-points";
const ROUTE_SOURCE = "geointel-route";
const ROUTE_LAYER = "geointel-route-line";
const STEP_SOURCE = "geointel-route-step";
const STEP_LAYER = "geointel-route-step-layer";
const NAV_SOURCE = "geointel-nav-position";
const NAV_LAYER_ACCURACY = "geointel-nav-accuracy";
const NAV_LAYER_PUCK = "geointel-nav-puck";
const BUILDINGS_SOURCE = "geointel-buildings-3d";
const BUILDINGS_LAYER = "geointel-buildings-3d-layer";
const MEASURE_SOURCE = "geointel-measure";
const MEASURE_LAYER_FILL = "geointel-measure-fill";
const MEASURE_LAYER_LINE = "geointel-measure-line";
const MEASURE_LAYER_LINE_CASING = "geointel-measure-line-casing";
const ANALYSIS_SOURCE = "geointel-analysis";
const ANALYSIS_LAYER_BUFFER_FILL = "geointel-analysis-buffer-fill";
const ANALYSIS_LAYER_BUFFER_LINE = "geointel-analysis-buffer-line";
const ANALYSIS_LAYER_CONNECTOR = "geointel-analysis-connector";
const ANALYSIS_LAYER_POINTS = "geointel-analysis-points";
const QUAKE_SOURCE = "geointel-earthquakes";
const QUAKE_LAYER = "geointel-earthquakes-layer";
const RADAR_SOURCE = "geointel-radar";
const RADAR_LAYER = "geointel-radar-layer";

/**
 * RainViewer stops serving real radar tiles past a fairly low zoom - and
 * instead of a 404 it returns an IMAGE with "Zoom Level Not Supported"
 * printed on it, which MapLibre then paints across the map like any other
 * tile. That is what put those grey placards over the streets.
 *
 * Capping the source's maxzoom here means MapLibre stops asking for tiles
 * that don't exist and over-zooms (stretches) the deepest real tile instead.
 * 10 is deliberately conservative: the radar composite is roughly a 1 km
 * grid, so there is no true detail beyond this anyway, and a blurry-but-real
 * radar is far better than a placard claiming nothing is supported.
 */
const RADAR_MAX_ZOOM = 10;
const HISTORY_SOURCE = "geointel-historical-imagery";
const HISTORY_LAYER = "geointel-historical-imagery-layer";

const LAYER_COLOR = new Map(LAYER_DEFS.map((l) => [l.id, l.color]));

function addOverlaySources(map: MapLibreMap) {
  if (!map.getSource(MARKER_SOURCE)) {
    map.addSource(MARKER_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      // See the note on GIS_SOURCE: OSM credit follows the data onto whatever
      // basemap it is drawn over.
      attribution: OSM_DATA_ATTRIBUTION,
    });

    map.addLayer({
      id: MARKER_LAYER_FILL,
      type: "fill",
      source: MARKER_SOURCE,
      paint: { "fill-color": "#2b5bd7", "fill-opacity": 0.08 },
    });

    map.addLayer({
      id: MARKER_LAYER_LINE,
      type: "line",
      source: MARKER_SOURCE,
      paint: { "line-color": "#2b5bd7", "line-width": 2, "line-dasharray": [2, 2] },
    });
  }

  if (!map.getSource(GIS_SOURCE)) {
    map.addSource(GIS_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      // ODbL attribution attaches to the DATA, not the backdrop. On the
      // satellite and dark basemaps the credit line names only Esri, so
      // without this an OSM-derived layer drawn over them appeared with no
      // OpenStreetMap credit anywhere on screen. MapLibre de-duplicates
      // attribution strings, so repeating it on every source is correct and
      // shows once.
      attribution: OSM_DATA_ATTRIBUTION,
    });
    map.addLayer({
      id: GIS_LAYER_POINTS,
      type: "circle",
      source: GIS_SOURCE,
      paint: {
        "circle-radius": 4,
        "circle-color": ["get", "color"],
        "circle-opacity": ["get", "opacity"],
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      // ODbL attribution attaches to the DATA, not the backdrop. On the
      // satellite and dark basemaps the credit line names only Esri, so
      // without this an OSM-derived layer drawn over them appeared with no
      // OpenStreetMap credit anywhere on screen. MapLibre de-duplicates
      // attribution strings, so repeating it on every source is correct and
      // shows once.
      attribution: OSM_DATA_ATTRIBUTION,
    });
    map.addLayer({
      id: ROUTE_LAYER,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#1a8a5f",
        "line-width": 5,
        "line-opacity": 0.85,
        // Valid per the MapLibre style spec (paint-property transitions),
        // but this maplibre-gl version's addLayer() typings don't include
        // it - real runtime feature, narrow type gap.
        "line-opacity-transition": { duration: 500, delay: 0 },
      } as maplibregl.LineLayerSpecification["paint"],
    });
  }

  // The turn you're currently looking at. A pulsing ring rather than another
  // pin, so it reads as "here on the route" and never gets confused with the
  // start/end markers or a search result.
  if (!map.getSource(STEP_SOURCE)) {
    map.addSource(STEP_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      // ODbL attribution attaches to the DATA, not the backdrop. On the
      // satellite and dark basemaps the credit line names only Esri, so
      // without this an OSM-derived layer drawn over them appeared with no
      // OpenStreetMap credit anywhere on screen. MapLibre de-duplicates
      // attribution strings, so repeating it on every source is correct and
      // shows once.
      attribution: OSM_DATA_ATTRIBUTION,
    });
    map.addLayer({
      id: STEP_LAYER,
      type: "circle",
      source: STEP_SOURCE,
      paint: {
        "circle-radius": 11,
        "circle-color": "#ffffff",
        "circle-opacity": 0.9,
        "circle-stroke-width": 4,
        "circle-stroke-color": "#1a8a5f",
      },
    });
  }

  // Live navigation: an accuracy halo and the position puck. Drawn from a
  // GeoJSON source rather than a DOM marker so it stays correctly placed
  // during the continuous easeTo of follow mode.
  if (!map.getSource(NAV_SOURCE)) {
    map.addSource(NAV_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      // ODbL attribution attaches to the DATA, not the backdrop. On the
      // satellite and dark basemaps the credit line names only Esri, so
      // without this an OSM-derived layer drawn over them appeared with no
      // OpenStreetMap credit anywhere on screen. MapLibre de-duplicates
      // attribution strings, so repeating it on every source is correct and
      // shows once.
      attribution: OSM_DATA_ATTRIBUTION,
    });
    map.addLayer({
      id: NAV_LAYER_ACCURACY,
      type: "circle",
      source: NAV_SOURCE,
      paint: {
        // Radius scaled from the device's REPORTED accuracy, so a vague fix
        // visibly looks vague instead of pretending to metre precision.
        "circle-radius": ["interpolate", ["linear"], ["get", "accuracy"], 0, 8, 100, 60],
        "circle-color": "#2b5bd7",
        "circle-opacity": 0.12,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#2b5bd7",
      },
    });
    map.addLayer({
      id: NAV_LAYER_PUCK,
      type: "circle",
      source: NAV_SOURCE,
      paint: {
        "circle-radius": 8,
        "circle-color": "#2b5bd7",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  if (!map.getSource(BUILDINGS_SOURCE)) {
    map.addSource(BUILDINGS_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      // ODbL attribution attaches to the DATA, not the backdrop. On the
      // satellite and dark basemaps the credit line names only Esri, so
      // without this an OSM-derived layer drawn over them appeared with no
      // OpenStreetMap credit anywhere on screen. MapLibre de-duplicates
      // attribution strings, so repeating it on every source is correct and
      // shows once.
      attribution: OSM_DATA_ATTRIBUTION,
    });
    map.addLayer({
      id: BUILDINGS_LAYER,
      type: "fill-extrusion",
      source: BUILDINGS_SOURCE,
      paint: {
        /**
         * Colour by HEIGHT, not by whether the height was estimated.
         *
         * The old version painted every building one of two near-identical
         * blues, which produced a field of flat grey-blue slabs where a
         * three-storey shop and a twenty-storey tower looked the same. A
         * height ramp is what makes an extruded city legible at a glance -
         * you can see where the tall buildings are, which is the entire
         * reason to turn 3D on.
         *
         * The estimated-height distinction still matters (it's the honest
         * signal that OSM didn't state a height), so it survives as a
         * desaturated variant rather than as the primary colour.
         */
        "fill-extrusion-color": [
          "case",
          ["get", "heightIsEstimated"],
          // Estimated: muted, cooler, visibly less confident.
          [
            "interpolate", ["linear"], ["get", "heightMeters"],
            0, "#aab6cc",
            15, "#93a3c0",
            40, "#7d90b4",
            100, "#6a7fa8",
          ],
          // Stated in the data: saturated, and it climbs to a warm top end
          // so a genuine high-rise stands out from its neighbours.
          [
            "interpolate", ["linear"], ["get", "heightMeters"],
            0, "#8fb0e8",
            15, "#5b7fd1",
            40, "#3f5fbf",
            100, "#2b3f9e",
            200, "#6b3fd4",
          ],
        ],
        "fill-extrusion-height": ["get", "heightMeters"],
        // Slightly lifted off the ground so the base edge reads as a wall
        // rather than the buildings looking painted onto the basemap.
        "fill-extrusion-base": 0,
        // Higher than before: at 0.85 the basemap showed through the walls
        // and every block looked like tinted glass.
        "fill-extrusion-opacity": 0.94,
        // Shades each face top-to-bottom, which is the only depth cue a
        // fill-extrusion layer has - without it every wall is one flat fill
        // and the whole city looks like cardboard.
        "fill-extrusion-vertical-gradient": true,
      },
    });
  }

  if (!map.getSource(QUAKE_SOURCE)) {
    map.addSource(QUAKE_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: QUAKE_LAYER,
      type: "circle",
      source: QUAKE_SOURCE,
      paint: {
        // Radius grows with magnitude AND with zoom, because a magnitude-7
        // event is a regional event: at world zoom it should read as a big
        // mark, and zooming in shouldn't shrink it into insignificance.
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2, ["interpolate", ["linear"], ["get", "magnitude"], 1, 2, 8, 14],
          8, ["interpolate", ["linear"], ["get", "magnitude"], 1, 5, 8, 34],
        ],
        // USGS's own convention: yellow through red with severity.
        "circle-color": [
          "interpolate", ["linear"], ["get", "magnitude"],
          1, "#f5d76e", 3, "#e0a825", 5, "#e07325", 6.5, "#c82828", 8, "#8b1a4a",
        ],
        "circle-opacity": 0.68,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  // Spatial analysis output (buffer ring, result points, nearest connector).
  // Added before the measure block so measurement always draws on top of an
  // analysis result rather than underneath it - you measure ON a result.
  if (!map.getSource(ANALYSIS_SOURCE)) {
    map.addSource(ANALYSIS_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

    map.addLayer({
      id: ANALYSIS_LAYER_BUFFER_FILL,
      type: "fill",
      source: ANALYSIS_SOURCE,
      filter: ["==", ["get", "role"], "buffer"],
      paint: { "fill-color": "#6b3fd4", "fill-opacity": 0.1 },
    });

    map.addLayer({
      id: ANALYSIS_LAYER_BUFFER_LINE,
      type: "line",
      source: ANALYSIS_SOURCE,
      filter: ["==", ["get", "role"], "buffer"],
      paint: { "line-color": "#6b3fd4", "line-width": 2 },
    });

    map.addLayer({
      id: ANALYSIS_LAYER_CONNECTOR,
      type: "line",
      source: ANALYSIS_SOURCE,
      filter: ["==", ["get", "role"], "connector"],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#6b3fd4", "line-width": 3, "line-dasharray": [1.5, 1.5] },
    });

    map.addLayer({
      id: ANALYSIS_LAYER_POINTS,
      type: "circle",
      source: ANALYSIS_SOURCE,
      filter: ["==", ["get", "role"], "result"],
      paint: {
        "circle-radius": 6,
        "circle-color": "#6b3fd4",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  if (!map.getSource(MEASURE_SOURCE)) {
    map.addSource(MEASURE_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

    // Reported bug: measuring drew the vertex dots but NO connecting line and
    // no polygon fill - the readout computed "1265 m², 4 points" correctly
    // while the map showed four unconnected dots.
    //
    // Same root cause the vertex circles already hit (see the note below):
    // these two layers were added AFTER the fill-extrusion buildings layer,
    // and a flat layer drawn after an extrusion layer is depth-tested against
    // it, so it can be occluded no matter what the paint order says. The
    // dots survived only because they'd already been moved to DOM markers.
    // Inserting the line/fill BENEATH the extrusion layer puts them back in
    // the flat pass where they can't be depth-culled - and it's the right
    // visual answer too, since a ground measurement should drape under a
    // building rather than float through it.
    const beforeBuildings = map.getLayer(BUILDINGS_LAYER) ? BUILDINGS_LAYER : undefined;

    // A white casing under the orange keeps the line legible on satellite
    // imagery and dark basemaps alike - plain orange on a bright rooftop was
    // near-invisible even when it did render.
    map.addLayer(
      {
        id: MEASURE_LAYER_FILL,
        type: "fill",
        source: MEASURE_SOURCE,
        paint: { "fill-color": "#e0a825", "fill-opacity": 0.25 },
      },
      beforeBuildings
    );

    map.addLayer(
      {
        id: MEASURE_LAYER_LINE_CASING,
        type: "line",
        source: MEASURE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 },
      },
      beforeBuildings
    );

    map.addLayer(
      {
        id: MEASURE_LAYER_LINE,
        type: "line",
        source: MEASURE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#e0a825", "line-width": 3 },
      },
      beforeBuildings
    );

    // Measurement VERTICES are intentionally NOT a GL circle layer here.
    // Root cause of "orange points sometimes appear/disappear": a flat
    // circle layer is composited by the WebGL painter's algorithm, and once
    // fill-extrusion (3D buildings) is present MapLibre engages real
    // depth-buffer testing for that layer - a point that is geometrically
    // "under" an extruded roof from the camera's angle gets depth-occluded
    // regardless of paint/add order, and the point flickers in and out as
    // the camera/zoom/pitch changes. Points are rendered as DOM
    // maplibregl.Marker instances instead (see measureMarkersRef below) -
    // the exact same mechanism already used reliably for the selected-
    // location pin - because DOM markers live in their own layer on top of
    // the WebGL canvas and can never be depth-occluded by anything the map
    // renders. The line/polygon preview stays a GL layer since it's meant
    // to drape along the ground, not sit as a discrete always-on-top mark.
  }
}

/**
 * Builds one DOM element for a measurement-vertex marker. pointer-events is
 * explicitly "none" so an existing marker can never swallow a click meant
 * for the map underneath it (adding the next point, or - once measuring is
 * off - hitting the GIS/POI click handlers). Visual style intentionally
 * matches the previous GL circle layer's paint (radius 5, white 2px
 * stroke, same orange) - only the rendering mechanism changed, not the
 * appearance.
 */
function createMeasurePointElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "measure-point-marker";
  el.style.width = "10px";
  el.style.height = "10px";
  el.style.borderRadius = "50%";
  el.style.background = "#e0a825";
  el.style.border = "2px solid #ffffff";
  el.style.boxSizing = "content-box";
  el.style.boxShadow = "0 0 0 1px rgba(0, 0, 0, 0.35)";
  el.style.pointerEvents = "none";
  return el;
}

interface MapViewProps {
  /**
   * Element the FullscreenControl should fullscreen instead of the bare map
   * canvas - see the comment where this is passed in Workspace.tsx for why.
   * Optional so MapView still works (falling back to MapLibre's own
   * default: the map's own container) if ever used without a wrapping
   * element that owns the sibling overlay controls.
   */
  fullscreenContainerRef?: RefObject<HTMLDivElement | null>;
}

export function MapView({ fullscreenContainerRef }: MapViewProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const lastCameraKey = useRef<string | null>(null);
  // DOM markers for measurement vertices - see createMeasurePointElement's
  // comment for why these are DOM markers instead of a GL circle layer.
  // Reconciled to measurePoints (grow/shrink + reposition) in the effect
  // below; never recreated wholesale on every render.
  const measureMarkersRef = useRef<Marker[]>([]);
  // True only between the map's "load" event and its teardown. Guards every
  // call that MapLibre rejects while a style is still loading.
  const styleReadyRef = useRef(false);
  // The map is constructed with the current basemap already applied, so the
  // basemap effect must not swap the style on its own first run.
  const isInitialBasemapRender = useRef(true);
  // Aborts the reverse-geocode from the previous map click. Clicking twice
  // quickly must not let the slower, older lookup land last and relabel the
  // newer pin.
  const pointLookupRef = useRef<AbortController | null>(null);
  const [loadPhase, setLoadPhase] = useState<MapLoadPhase>("loading");
  // Bumped by "Try again", which is the map-creation effect's only
  // dependency - so a retry tears the old instance down and builds a fresh
  // one, rather than poking at a map that already failed.
  const [retryToken, setRetryToken] = useState(0);

  const basemap = useMapStore((s) => s.basemap);
  const is3D = useMapStore((s) => s.is3D);
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const setCenter = useMapStore((s) => s.setCenter);

  const selectedLocation = useLocationStore((s) => s.selectedLocation);
  const radiusMeters = useLocationStore((s) => s.radiusMeters);

  const gisEvidence = useGisEvidence();
  const layerVisibility = useGisUiStore((s) => s.visibility);
  const layerOpacity = useGisUiStore((s) => s.opacity);
  const routeQuery = useRoute();
  const selectedRouteOption = useRouteStore((s) => s.selectedOption);
  const activeRouteStep = useRouteStore((s) => s.activeStep);
  const navState = useNavigationStore((s) => s.state);
  const navSnapped = useNavigationStore((s) => s.snapped);
  const navAccuracy = useNavigationStore((s) => s.accuracyMeters);
  const navHeading = useNavigationStore((s) => s.heading);
  const navFollowing = useNavigationStore((s) => s.following);
  const navActive = navState === "navigating" || navState === "locating" || navState === "rerouting";
  const activeRouteOption = routeQuery.data?.options?.[selectedRouteOption] ?? routeQuery.data?.options?.[0];
  const activeRouteGeometry = activeRouteOption?.geometry ?? routeQuery.data?.geometry ?? null;
  const activeStepLocation =
    activeRouteStep !== null ? (activeRouteOption?.steps?.[activeRouteStep]?.location ?? null) : null;

  const viewportBbox = useMapStore((s) => s.viewportBbox);
  const setViewportBbox = useMapStore((s) => s.setViewportBbox);
  const cameraRequest = useMapStore((s) => s.cameraRequest);
  const buildings3D = useBuildings3D(viewportBbox, zoom, is3D);
  const buildingsCollection = useMemo(() => buildingsToGeoJSON(buildings3D.data ?? []), [buildings3D.data]);

  const measureMode = useMeasureStore((s) => s.mode);
  const measurePoints = useMeasureStore((s) => s.points);
  const measureCollection = useMemo(() => buildMeasureGeoJSON(measureMode, measurePoints), [measureMode, measurePoints]);

  const analysisResult = useAnalysisStore((s) => s.result);
  const analysisCollection = useMemo(() => analysisToGeoJSON(analysisResult), [analysisResult]);

  // Live layers. Each hook is inert until its switch is on (see
  // useLiveLayers.ts), so an unused layer costs no request.
  const quakesEnabled = useLiveLayerStore((s) => s.enabled.earthquakes);
  const radarEnabled = useLiveLayerStore((s) => s.enabled.radar);
  const quakes = useEarthquakes();
  const radar = useRadarFrame();
  const quakeCollection = useMemo(
    () => earthquakesToGeoJSON(quakesEnabled ? (quakes.data?.events ?? []) : []),
    [quakesEnabled, quakes.data]
  );
  const radarTileUrl = radarEnabled ? (radar.data?.tileUrl ?? null) : null;

  // Dated satellite imagery (features/timeline). Pure URL construction - no
  // request until MapLibre asks for a tile.
  const historyEnabled = useTimelineStore((s) => s.enabled);
  const historyDate = useTimelineStore((s) => s.date);
  const historyLayerId = useTimelineStore((s) => s.layerId);
  const historyOpacity = useTimelineStore((s) => s.opacity);
  const historyLayer = GIBS_LAYERS.find((l) => l.id === historyLayerId) ?? GIBS_LAYERS[0]!;
  const historyTileUrl = historyEnabled ? buildGibsTileUrl(historyLayer, historyDate) : null;

  // The buildings collection actually pushed to the map: cleared (not merely
  // hidden) when 3D is off or the map is zoomed out, rather than left showing
  // a stale skyline. Hoisted out of its effect because a style-swap restore
  // has to re-apply exactly this, not the raw fetched collection.
  const activeBuildingsCollection = useMemo(
    () => (is3D && zoom >= 16 ? buildingsCollection : { type: "FeatureCollection" as const, features: [] }),
    [buildingsCollection, is3D, zoom]
  );

  const gisFeatureCollection = useMemo(() => {
    const features = gisEvidence.data?.features ?? [];
    return {
      type: "FeatureCollection" as const,
      features: features
        .map((f) => {
          const layers = bucketFeature(f);
          const visibleLayer = pickVisibleLayer(layers, layerVisibility);
          if (!visibleLayer) return null;
          return {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [f.lon, f.lat] },
            properties: { color: LAYER_COLOR.get(visibleLayer) ?? "#2b5bd7", opacity: layerOpacity, layer: visibleLayer },
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null),
    };
  }, [gisEvidence.data, layerVisibility, layerOpacity]);

  // Everything a style swap destroys and has to put back, kept current on
  // every render. A ref rather than effect deps on purpose: the restore is
  // triggered by MapLibre events fired from outside React's render cycle
  // (see the styledata listener below), so it needs whatever the truth is at
  // the instant it runs, not whatever was captured when a listener was
  // registered.
  const overlayStateRef = useRef<OverlaySnapshot>({
    location: null,
    radiusMeters,
    gis: gisFeatureCollection,
    buildings: activeBuildingsCollection,
    measure: measureCollection,
    analysis: analysisCollection,
    earthquakes: quakeCollection,
    radarTileUrl,
    historyTileUrl,
    historyOpacity,
    historyMaxZoom: historyLayer.maxZoom,
    routeGeometry: null,
    activeStepLocation: null,
  });
  overlayStateRef.current = {
    location: selectedLocation,
    radiusMeters,
    gis: gisFeatureCollection,
    buildings: activeBuildingsCollection,
    measure: measureCollection,
    analysis: analysisCollection,
    earthquakes: quakeCollection,
    radarTileUrl,
    historyTileUrl,
    historyOpacity,
    historyMaxZoom: historyLayer.maxZoom,
    routeGeometry: activeRouteGeometry,
    activeStepLocation: activeStepLocation,
  };

  // Create the map once - or again, if the user presses "Try again" after a
  // failed load. `retryToken` is the only dependency, so the map is never
  // rebuilt for any other reason.
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    setLoadPhase("loading");

    const map = new maplibregl.Map({
      container,
      style: buildBasemapStyle(basemap),
      center,
      zoom,
      pitch: is3D ? 55 : 0,
      attributionControl: { compact: true },
    });

    // A map constructed while its container is still 0×0 - which happens on
    // a first paint if fonts, the shell grid, or a phone's address-bar
    // collapse settle a frame later - renders once at zero size and then
    // never repaints, which is the classic "map didn't load" that goes away
    // on a manual resize. Watching the box and calling resize() removes that
    // whole class of intermittent blank map.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    /**
     * The cases a ResizeObserver alone does not catch, all of them phone
     * cases, and all reported as "the map is a thin strip with white space
     * under it".
     *
     * Watching the container's box assumes the box is what changed. On iOS it
     * often isn't:
     *
     *   - Returning to a backgrounded tab. iOS discards WebGL contexts under
     *     memory pressure, so the canvas comes back holding a stale frame at
     *     a stale size while its container box never changed. Nothing fires.
     *   - Back/forward cache. A page restored by pageshow (persisted) is the
     *     same DOM with the same measurements and a canvas that no longer
     *     matches them.
     *   - The address bar collapsing. That changes the visual viewport, and
     *     100dvh with it, but during the animation iOS reports the container
     *     box inconsistently and the observer can settle on the wrong height.
     *
     * So the map is told to re-measure on the events that actually fire in
     * those moments. resize() is cheap and idempotent, and a redundant call
     * costs nothing next to a visitor deciding the map is broken.
     */
    let disposed = false;
    let resizeFrame = 0;
    const forceResize = () => {
      if (disposed) return;
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        if (disposed) return;
        map.resize();
        // iOS reports the settled size a beat after the event rather than
        // during it, so the second pass is the one that usually lands.
        window.setTimeout(() => {
          if (!disposed) map.resize();
        }, 250);
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") forceResize();
    };
    /** A WebGL context lost with the default action allowed is never restored. */
    const onContextLost = (event: Event) => event.preventDefault();
    const onContextRestored = () => {
      forceResize();
      map.triggerRepaint();
    };

    const canvas = map.getCanvas();
    window.addEventListener("resize", forceResize);
    window.addEventListener("orientationchange", forceResize);
    window.addEventListener("pageshow", forceResize);
    document.addEventListener("visibilitychange", onVisibility);
    window.visualViewport?.addEventListener("resize", forceResize);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    // Two honest timers instead of one indefinite spinner.
    const slowTimer = window.setTimeout(() => {
      setLoadPhase((p) => (p === "loading" ? "slow" : p));
    }, SLOW_AFTER_MS);
    const failTimer = window.setTimeout(() => {
      setLoadPhase((p) => (p === "ready" ? p : "failed"));
    }, FAIL_AFTER_MS);

    // MapLibre reports tile and style failures here rather than throwing.
    // Only a style-level failure means the map itself is unusable - a single
    // missing tile is normal at the edges of a source's coverage and must
    // not blank out a working map.
    map.on("error", (event) => {
      const source = (event as { sourceId?: string }).sourceId;
      const isStyleFailure = !source;
      if (isStyleFailure) setLoadPhase((p) => (p === "ready" ? p : "failed"));
      if (import.meta.env.DEV) console.warn("[map]", event.error?.message ?? event);
    });

    map.addControl(new NavigationControl({ showCompass: true }), "top-right");
    // Fullscreen the whole map area (map + MapControls + MeasureToolbar +
    // DirectionsPanel + Copilot + teaser), not just the bare canvas -
    // see fullscreenContainerRef's doc comment above for why that matters.
    map.addControl(
      new FullscreenControl(fullscreenContainerRef?.current ? { container: fullscreenContainerRef.current } : undefined),
      "top-right"
    );

    const updateViewport = () => {
      const c = map.getCenter();
      setCenter([c.lng, c.lat], map.getZoom());
      const b = map.getBounds();
      setViewportBbox({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    };

    // addSource/addLayer/setStyle all throw "Style is not done loading" until
    // the first style load completes. Both the styledata net below and the
    // basemap effect further down consult this before touching the style, so
    // neither can fire into that window. A ref rather than a local because
    // the basemap effect needs to read it too.
    styleReadyRef.current = false;

    map.on("load", () => {
      styleReadyRef.current = true;
      setLoadPhase("ready");
      window.clearTimeout(slowTimer);
      window.clearTimeout(failTimer);
      addOverlaySources(map);
      updateViewport();
      // One more resize after load: by now the container has definitely
      // settled, and MapLibre sized its canvas from whatever the box was at
      // construction time.
      map.resize();
    });
    map.on("moveend", updateViewport);

    // Safety net: put the overlays back whenever a style change has removed
    // them. The basemap effect below already restores them synchronously on
    // the normal path; this covers the path it can't - MapLibre falling back
    // to rebuilding the style from scratch when a diff fails (see
    // _updateDiff's catch in maplibre-gl), which replaces the whole Style
    // object asynchronously and would wipe a synchronous restore.
    //
    // Cheap and non-recursive: it early-returns the moment the sources exist,
    // which is true for all but the handful of styledata events that follow
    // an actual swap.
    map.on("styledata", () => {
      if (!styleReadyRef.current) return;
      if (map.getSource(MARKER_SOURCE)) return;
      restoreOverlays(map, overlayStateRef.current);
    });

    // Click anywhere → that place becomes the selected location.
    //
    // This used to open a separate little "Property information" card while
    // the real Explore panel kept showing whatever you had searched for
    // earlier. Two panels, two answers, and the click never actually
    // selected anything - which is why "click anywhere on the map" didn't
    // do what the onboarding promised. Now a click runs exactly the path a
    // search runs: marker moves, Explore opens, intelligence/property/
    // layers/radius/AI context all follow the point you clicked.
    //
    // Snapping: clicking a rendered GIS point uses that feature's own
    // coordinates rather than the pixel you happened to hit, so tapping a
    // hospital dot selects the hospital, not a spot three metres beside it.
    const clickAt = (lat: number, lon: number) => {
      // Cancel a still-running lookup from the previous click so a slow
      // reverse geocode can't land after a newer one.
      pointLookupRef.current?.abort();
      const controller = new AbortController();
      pointLookupRef.current = controller;
      void selectMapPoint(lat, lon, controller.signal);
    };

    map.on("click", GIS_LAYER_POINTS, (e) => {
      if (useMeasureStore.getState().mode !== "off") return; // handled by the generic measure listener below
      const feature = e.features?.[0];
      if (feature?.geometry.type === "Point") {
        const [lon, lat] = feature.geometry.coordinates as [number, number];
        clickAt(lat, lon);
      }
    });
    map.on("click", (e) => {
      if (useMeasureStore.getState().mode !== "off") {
        useMeasureStore.getState().addPoint([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      const hits = map.queryRenderedFeatures(e.point, { layers: [GIS_LAYER_POINTS] });
      if (hits.length > 0) return; // handled by the dedicated layer listener above
      clickAt(e.lngLat.lat, e.lngLat.lng);
    });
    map.on("mouseenter", GIS_LAYER_POINTS, () => {
      if (useMeasureStore.getState().mode !== "off") return; // crosshair takes priority while measuring
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", GIS_LAYER_POINTS, () => {
      const mode = useMeasureStore.getState().mode;
      map.getCanvas().style.cursor = mode !== "off" ? "crosshair" : "";
    });

    mapRef.current = map;

    return () => {
      // Set first: a queued frame or timeout from forceResize must not touch
      // a map that is about to be removed.
      disposed = true;
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", forceResize);
      window.removeEventListener("orientationchange", forceResize);
      window.removeEventListener("pageshow", forceResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.visualViewport?.removeEventListener("resize", forceResize);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      window.clearTimeout(slowTimer);
      window.clearTimeout(failTimer);
      map.remove();
      mapRef.current = null;
      pointLookupRef.current?.abort();
      pointLookupRef.current = null;
      styleReadyRef.current = false;
      // The next map instance is constructed with the current basemap
      // already applied, exactly like the first one, so its basemap effect
      // must skip its swap too. Without this reset, a remount (React's
      // StrictMode double-invoke in development, an ErrorBoundary reset, a
      // fast refresh) immediately re-applies setStyle to a brand-new map
      // whose style has not loaded yet.
      isInitialBasemapRender.current = true;
    };
    // retryToken is the ONLY dependency: the map is created once and rebuilt
    // only when the user asks for a retry. Every other reactive update below
    // goes through the ref rather than re-creating the instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryToken]);

  // Basemap changes require a style swap, which drops custom sources/layers -
  // re-add them immediately afterwards. See the note on the restore call
  // below for why "immediately" and not "once the new style loads".
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // The "create the map once" effect above already constructs it with
    // `style: buildBasemapStyle(basemap)` - this effect also runs on that
    // same initial mount (every effect does), which used to call
    // map.setStyle() again with the IDENTICAL style right after the map
    // had just loaded it, forcing a wasted, redundant tile refetch (and an
    // avoidable early style-swap race) on every single page load before
    // the user ever touched the basemap control. Only real basemap changes
    // should trigger a swap.
    if (isInitialBasemapRender.current) {
      isInitialBasemapRender.current = false;
      return;
    }

    // setStyle() throws "Style is not done loading" if the map's FIRST style
    // hasn't finished yet, and this effect can genuinely land in that window:
    // pick a different basemap in the first second of a slow page load, and
    // the map crashes into its error boundary. Deferring to "load" is the
    // whole fix - the swap still happens, just as soon as it legally can.
    const applyBasemap = () => {
      map.setStyle(buildBasemapStyle(basemap));
      restoreOverlays(map, overlayStateRef.current);
    };

    if (!styleReadyRef.current) {
      map.once("load", applyBasemap);
      return;
    }

    applyBasemap();
    // The restore above used to be `map.once("style.load", ...)`, and that
    // event NEVER
    // FIRED - the single cause of the long-standing "switch the basemap and
    // the overlays are gone" bug, which showed up most visibly as measurement
    // drawing its vertex dots and nothing else. (The dots are DOM markers;
    // DOM markers survive a style swap, GL layers don't - so the line and the
    // area fill vanished while the dots stayed, which is exactly the symptom
    // that was reported.) It silently broke GIS points, the route line, the
    // radius circle and 3D buildings in the same stroke.
    //
    // Why it never fired: map.setStyle(styleObject) does NOT reload the style
    // by default. It takes the diff path (Map._diffStyle -> _updateDiff ->
    // Style.setState), which computes the difference between the CURRENT
    // serialized style - custom sources and layers included, since they're
    // part of the style once added - and the new basemap, then applies the
    // resulting removeLayer/removeSource operations. It reuses the existing
    // Style object rather than constructing a new one, so "style.load", which
    // is fired only from Style._load(), is never emitted. A listener for it
    // is dead code, waiting on an event that by construction cannot arrive.
    //
    // Style.setState applies those operations SYNCHRONOUSLY and setStyle
    // returns after they have run, so the overlays are already gone by the
    // next line of applyBasemap and can simply be re-added. No event, no
    // waiting, no race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  // GIS feature points follow the layer manager's visibility/opacity state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenSourceReady(map, GIS_SOURCE, () => syncGisPoints(map, gisFeatureCollection));
  }, [gisFeatureCollection]);

  // 3D building extrusions follow the viewport + zoom + 3D toggle (see
  // useBuildings3D.ts) - cleared immediately when 3D is off or zoomed out
  // rather than left showing a stale skyline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenSourceReady(map, BUILDINGS_SOURCE, () => syncBuildings3D(map, activeBuildingsCollection));
  }, [activeBuildingsCollection]);

  // Measurement preview (MeasureToolbar.tsx) follows the store's points, and
  // the cursor turns into a crosshair while a measurement mode is active so
  // it's clear clicks add points instead of opening the POI inspector.
  // (The line/polygon draped along the ground is the only part still drawn
  // via this GL source - vertices are DOM markers, synced separately below.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenSourceReady(map, MEASURE_SOURCE, () => syncMeasure(map, measureCollection));
    map.getCanvas().style.cursor = measureMode !== "off" ? "crosshair" : "";
  }, [measureCollection, measureMode]);

  // Spatial analysis output (SpatialAnalysisPanel.tsx): the buffer ring,
  // result points and the nearest-connector line, all from one source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenSourceReady(map, ANALYSIS_SOURCE, () => syncAnalysis(map, analysisCollection));
  }, [analysisCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenSourceReady(map, QUAKE_SOURCE, () => syncEarthquakes(map, quakeCollection));
  }, [quakeCollection]);

  // Radar creates and destroys its own source, so it has no source to wait
  // on - it only needs the style to be loaded enough to accept addSource.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    syncRadar(map, radarTileUrl);
  }, [radarTileUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    syncHistoricalImagery(map, historyTileUrl, historyOpacity, historyLayer.maxZoom);
  }, [historyTileUrl, historyOpacity, historyLayer.maxZoom]);

  // Measurement VERTICES: rebuild the DOM Marker set from scratch every
  // time the store's points change. Deliberately NOT incremental
  // (grow/shrink + reposition by index) - a point count here is always a
  // handful of vertices, so the cost of tearing down and recreating is
  // negligible, and doing it this way makes an entire class of bug
  // impossible: the marker array can never drift out of sync with the
  // store (a stale leftover from a previous measurement session, an index
  // pointed at the wrong point after an Undo, one marker double-counted
  // after a fast-refresh remount mid-session). Every run, unconditionally:
  // a marker exists on the map if and only if its point exists in the
  // store right now, full stop - no bookkeeping to get wrong on a second
  // or third use.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    measureMarkersRef.current.forEach((marker) => marker.remove());

    // setLngLat() MUST be called before addTo(): Marker.addTo() immediately
    // calls _update(), which projects the marker's current _lngLat - if
    // that's still unset (the constructor doesn't require or default it),
    // _update() throws reading .lng off undefined and takes the whole map
    // down with it. Position first, attach second.
    measureMarkersRef.current = measurePoints.map((point) => {
      const marker = new maplibregl.Marker({ element: createMeasurePointElement(), anchor: "center" });
      marker.setLngLat(point);
      marker.addTo(map);
      return marker;
    });
  }, [measurePoints]);

  // Unmount safety net for the marker set above - a plain component
  // unmount, an ErrorBoundary reset elsewhere on the page, or (in dev) a
  // fast-refresh-forced remount must never leave orphaned marker DOM nodes
  // behind, tracked by a ref instance that's about to be discarded.
  useEffect(() => {
    return () => {
      measureMarkersRef.current.forEach((marker) => marker.remove());
      measureMarkersRef.current = [];
    };
  }, []);

  // Draw the SELECTED route option and fit the map to it.
  //
  // Selected, not always the first: picking an alternative in the panel has
  // to move the line on the map too, or the panel and the map are telling
  // the user two different things about the same trip.
  useEffect(() => {
    const map = mapRef.current;
    const route = routeQuery.data;
    const option = route?.options?.[selectedRouteOption] ?? route?.options?.[0];
    const geometry = option?.geometry ?? route?.geometry;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      if (!geometry || geometry.length === 0) {
        source.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      source.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: geometry } }],
      });

      // Route-draw: drop opacity to 0 and back up on the next frame so the
      // line-opacity-transition (see addOverlaySources) actually has a
      // value change to animate - setData alone doesn't trigger a paint
      // transition since the opacity value itself hasn't changed.
      if (map.getLayer(ROUTE_LAYER)) {
        map.setPaintProperty(ROUTE_LAYER, "line-opacity", 0);
        requestAnimationFrame(() => {
          if (map.getLayer(ROUTE_LAYER)) map.setPaintProperty(ROUTE_LAYER, "line-opacity", 0.85);
        });
      }

      // Don't yank the camera back to the whole route while the user is
      // stepping through turns - that would fight the step-zoom below.
      if (activeRouteStep !== null) return;

      const bounds = geometry.reduce(
        (b, coord) => b.extend(coord as [number, number]),
        new maplibregl.LngLatBounds(geometry[0], geometry[0])
      );
      map.fitBounds(bounds, { padding: 80, duration: 700 });
    };

    whenSourceReady(map, ROUTE_SOURCE, apply);
    // activeRouteStep is deliberately NOT a dependency: it only guards the
    // camera inside this effect, and adding it would re-fit the route every
    // time the user tapped a turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeQuery.data, selectedRouteOption]);

  // Tapping a turn in the directions list flies there and marks it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const route = routeQuery.data;
    const option = route?.options?.[selectedRouteOption] ?? route?.options?.[0];
    const step = activeRouteStep !== null ? option?.steps?.[activeRouteStep] : undefined;

    const apply = () => {
      const source = map.getSource(STEP_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: step
          ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: step.location } }]
          : [],
      });
    };

    whenSourceReady(map, STEP_SOURCE, apply);

    if (!step) return;
    // Close enough to see the junction, which is the point of tapping a turn.
    map.easeTo({ center: step.location, zoom: Math.max(map.getZoom(), 16), duration: 650 });
  }, [activeRouteStep, selectedRouteOption, routeQuery.data]);

  // Live navigation: draw the position puck and, while following, keep the
  // camera on it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(NAV_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features:
          navSnapped && navActive
            ? [
                {
                  type: "Feature",
                  properties: { accuracy: navAccuracy ?? 20 },
                  geometry: { type: "Point", coordinates: navSnapped },
                },
              ]
            : [],
      });
    };

    whenSourceReady(map, NAV_SOURCE, apply);

    if (!navActive || !navSnapped || !navFollowing) return;

    // Follow mode. Pitched and rotated to the direction of travel, like every
    // driving navigator - but only when the device actually reports a
    // heading, since a desktop reports null and a map that snapped to north
    // on every fix would be worse than one that never rotated.
    map.easeTo({
      center: navSnapped,
      zoom: Math.max(map.getZoom(), 16.5),
      ...(navHeading !== null ? { bearing: navHeading, pitch: 50 } : {}),
      duration: 900,
      // Marked so the drag handler below can tell OUR camera moves from the
      // user's, and only stop following for the user's.
      essential: true,
    });
  }, [navSnapped, navAccuracy, navHeading, navFollowing, navActive]);

  // Dragging the map during navigation stops the camera following, so the
  // user can look ahead without the next fix yanking them back. The
  // "Re-centre" button in the HUD turns it back on.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navActive) return;
    const onDrag = () => useNavigationStore.getState().setFollowing(false);
    map.on("dragstart", onDrag);
    return () => {
      map.off("dragstart", onDrag);
    };
  }, [navActive]);

  useEffect(() => {
    mapRef.current?.easeTo({ pitch: is3D ? 55 : 0, duration: 500 });
  }, [is3D]);

  // Camera moves requested by panels outside the map - see mapStore's
  // cameraRequest doc comment.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cameraRequest) return;
    map.easeTo({
      center: cameraRequest.center ?? map.getCenter(),
      zoom: cameraRequest.zoom ?? map.getZoom(),
      pitch: cameraRequest.pitch ?? map.getPitch(),
      duration: 800,
    });
  }, [cameraRequest]);

  // Marker + radius circle follow the selected location.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedLocation) {
      markerRef.current?.remove();
      markerRef.current = null;
      // Picking the same place again after clearing it should still fly there.
      lastCameraKey.current = null;
      syncOverlay(map, null, radiusMeters);
      return;
    }

    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: "#2b5bd7" });
    }
    markerRef.current.setLngLat([selectedLocation.lon, selectedLocation.lat]).addTo(map);

    /*
      Move the camera only when the point or the radius actually changed.

      A selection is set in two steps now: immediately from the search
      result, then again once the reverse geocode adds the street address.
      Both describe the same point, and easing again on the second one made
      the map twitch a second or two after it had settled.
    */
    const cameraKey = `${selectedLocation.lat},${selectedLocation.lon},${radiusMeters}`;
    // A shared link has already put the camera where the sender had it,
    // including a zoom below street level that the line below would override.
    const placed = useMapStore.getState().cameraPlacedFor;
    if (placed === `${selectedLocation.lat},${selectedLocation.lon}`) {
      useMapStore.getState().markCameraPlaced(null);
      lastCameraKey.current = cameraKey;
    } else if (lastCameraKey.current !== cameraKey) {
      lastCameraKey.current = cameraKey;
      map.easeTo({ center: [selectedLocation.lon, selectedLocation.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
    }

    whenSourceReady(map, MARKER_SOURCE, () => syncOverlay(map, selectedLocation, radiusMeters));
  }, [selectedLocation, radiusMeters]);

  return (
    <div className="map-view">
      <div ref={containerRef} className="map-view__canvas" role="application" aria-label="Interactive map" />
      <MapLoadState phase={loadPhase} onRetry={() => setRetryToken((t) => t + 1)} />
    </div>
  );
}

/**
 * Everything a style swap destroys: the custom sources and layers, plus the
 * data that was in them. Re-adding the sources is not enough on its own -
 * they come back EMPTY, so a restore that skipped the syncs would leave the
 * map just as blank while looking, in the style JSON, like it had worked.
 */
interface OverlaySnapshot {
  location: { lat: number; lon: number } | null;
  radiusMeters: number;
  gis: GeoJSON.FeatureCollection;
  buildings: GeoJSON.FeatureCollection;
  measure: GeoJSON.FeatureCollection;
  analysis: GeoJSON.FeatureCollection;
  earthquakes: GeoJSON.FeatureCollection;
  radarTileUrl: string | null;
  historyTileUrl: string | null;
  historyOpacity: number;
  historyMaxZoom: number;
  /** Geometry of the option currently drawn, so a style swap can redraw it. */
  routeGeometry: Array<[number, number]> | null;
  /** [lon, lat] of the highlighted turn, or null when the whole route shows. */
  activeStepLocation: [number, number] | null;
}

/**
 * Idempotent by construction: addOverlaySources() no-ops on sources that
 * already exist and every sync is a plain setData, so calling this when
 * nothing was actually lost costs a few map lookups and changes nothing.
 * That matters because it runs from an event handler that can't know for
 * certain whether a given styledata event followed a real swap.
 */
function restoreOverlays(map: MapLibreMap, snapshot: OverlaySnapshot) {
  addOverlaySources(map);
  syncOverlay(map, snapshot.location, snapshot.radiusMeters);
  // The route was missing from this list, so switching basemap in the middle
  // of a set of directions silently erased the line while the panel kept
  // showing the steps.
  syncRoute(map, snapshot.routeGeometry, snapshot.activeStepLocation);
  syncGisPoints(map, snapshot.gis);
  syncBuildings3D(map, snapshot.buildings);
  syncMeasure(map, snapshot.measure);
  syncAnalysis(map, snapshot.analysis);
  syncEarthquakes(map, snapshot.earthquakes);
  syncRadar(map, snapshot.radarTileUrl);
  syncHistoricalImagery(map, snapshot.historyTileUrl, snapshot.historyOpacity, snapshot.historyMaxZoom);
}

function syncOverlay(map: MapLibreMap, location: { lat: number; lon: number } | null, radiusMeters: number) {
  const source = map.getSource(MARKER_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  if (!location) {
    source.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  const circle = circlePolygon(location.lat, location.lon, radiusMeters);
  source.setData({ type: "FeatureCollection", features: [circle] });
}

function syncGisPoints(map: MapLibreMap, collection: GeoJSON.FeatureCollection) {
  const source = map.getSource(GIS_SOURCE) as maplibregl.GeoJSONSource | undefined;
  source?.setData(collection);
}

function syncBuildings3D(map: MapLibreMap, collection: GeoJSON.FeatureCollection) {
  const source = map.getSource(BUILDINGS_SOURCE) as maplibregl.GeoJSONSource | undefined;
  source?.setData(collection);
}

function syncMeasure(map: MapLibreMap, collection: GeoJSON.FeatureCollection) {
  const source = map.getSource(MEASURE_SOURCE) as maplibregl.GeoJSONSource | undefined;
  source?.setData(collection);
}

function syncAnalysis(map: MapLibreMap, collection: GeoJSON.FeatureCollection) {
  const source = map.getSource(ANALYSIS_SOURCE) as maplibregl.GeoJSONSource | undefined;
  source?.setData(collection);
}

function syncEarthquakes(map: MapLibreMap, collection: GeoJSON.FeatureCollection) {
  const source = map.getSource(QUAKE_SOURCE) as maplibregl.GeoJSONSource | undefined;
  source?.setData(collection);
}

/**
 * Radar is a RASTER source whose tile URL changes every few minutes as new
 * frames are published, and a raster source's tiles can't be swapped in
 * place - so it is torn down and rebuilt whenever the URL changes, and
 * removed entirely when the layer is switched off (rather than left loading
 * tiles behind an opacity of 0, which would keep costing requests).
 */
/**
 * Dated satellite imagery, rebuilt whenever the date or product changes for
 * the same reason radar is: a raster source's tile template is fixed at
 * creation. Opacity, though, IS a paint property, so blending against the
 * live basemap is applied in place without a rebuild - otherwise dragging
 * the blend slider would tear down and re-fetch every tile on every step.
 */
function syncHistoricalImagery(map: MapLibreMap, tileUrl: string | null, opacity: number, maxZoom: number) {
  const existing = map.getSource(HISTORY_SOURCE) as (maplibregl.RasterTileSource & { tiles?: string[] }) | undefined;
  const currentUrl = existing?.tiles?.[0] ?? null;

  if (currentUrl === tileUrl) {
    if (tileUrl && map.getLayer(HISTORY_LAYER)) map.setPaintProperty(HISTORY_LAYER, "raster-opacity", opacity);
    return;
  }

  if (map.getLayer(HISTORY_LAYER)) map.removeLayer(HISTORY_LAYER);
  if (existing) map.removeSource(HISTORY_SOURCE);
  if (!tileUrl) return;

  map.addSource(HISTORY_SOURCE, {
    type: "raster",
    tiles: [tileUrl],
    tileSize: 256,
    // Past this, GIBS returns 404s rather than upscaling. Capping here lets
    // MapLibre stretch the deepest real tiles instead of showing holes.
    maxzoom: maxZoom,
    attribution: "NASA EOSDIS GIBS",
  });

  // Directly above the basemap and below everything else: it replaces what
  // the ground looks like, and must never cover the data drawn on it.
  const firstOverlay = map.getLayer(MARKER_LAYER_FILL) ? MARKER_LAYER_FILL : undefined;
  map.addLayer({ id: HISTORY_LAYER, type: "raster", source: HISTORY_SOURCE, paint: { "raster-opacity": opacity } }, firstOverlay);
}

/**
 * The route line and the highlighted turn. One function so the live effects
 * and the post-style-swap restore can't drift apart - the class of bug that
 * makes an overlay vanish only when you change basemap.
 */
function syncRoute(map: MapLibreMap, geometry: Array<[number, number]> | null, stepLocation: [number, number] | null) {
  const routeSource = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (routeSource) {
    routeSource.setData({
      type: "FeatureCollection",
      features:
        geometry && geometry.length > 0
          ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: geometry } }]
          : [],
    });
  }

  const stepSource = map.getSource(STEP_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (stepSource) {
    stepSource.setData({
      type: "FeatureCollection",
      features: stepLocation ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: stepLocation } }] : [],
    });
  }
}

function syncRadar(map: MapLibreMap, tileUrl: string | null) {
  const existing = map.getSource(RADAR_SOURCE) as (maplibregl.RasterTileSource & { tiles?: string[] }) | undefined;
  const currentUrl = existing?.tiles?.[0] ?? null;
  if (currentUrl === tileUrl) return;

  if (map.getLayer(RADAR_LAYER)) map.removeLayer(RADAR_LAYER);
  if (existing) map.removeSource(RADAR_SOURCE);
  if (!tileUrl) return;

  map.addSource(RADAR_SOURCE, {
    type: "raster",
    tiles: [tileUrl],
    tileSize: 256,
    maxzoom: RADAR_MAX_ZOOM,
    attribution: "RainViewer",
  });
  // Above the basemap, beneath every vector overlay: weather is background
  // context, and it must never sit on top of the data being analysed.
  const firstOverlay = map.getLayer(MARKER_LAYER_FILL) ? MARKER_LAYER_FILL : undefined;
  map.addLayer({ id: RADAR_LAYER, type: "raster", source: RADAR_SOURCE, paint: { "raster-opacity": 0.6 } }, firstOverlay);
}
