import { useEffect, useMemo, useRef } from "react";
import maplibregl, { Map as MapLibreMap, Marker, NavigationControl, FullscreenControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildBasemapStyle } from "./basemaps";
import { circlePolygon } from "./geo";
import { useMapStore } from "@/stores/mapStore";
import { useLocationStore } from "@/stores/locationStore";
import { useGisEvidence } from "@/features/gis/useGisEvidence";
import { useGisUiStore } from "@/stores/gisUiStore";
import { bucketFeature, LAYER_DEFS } from "@/features/gis/layerBuckets";
import { useRoute } from "@/features/routing/useRoute";
import "./MapView.css";

const MARKER_SOURCE = "geointel-radius";
const MARKER_LAYER_FILL = "geointel-radius-fill";
const MARKER_LAYER_LINE = "geointel-radius-line";
const GIS_SOURCE = "geointel-gis-features";
const GIS_LAYER_POINTS = "geointel-gis-points";
const ROUTE_SOURCE = "geointel-route";
const ROUTE_LAYER = "geointel-route-line";

const LAYER_COLOR = new Map(LAYER_DEFS.map((l) => [l.id, l.color]));

function addOverlaySources(map: MapLibreMap) {
  if (!map.getSource(MARKER_SOURCE)) {
    map.addSource(MARKER_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
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
    map.addSource(GIS_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
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
    map.addSource(ROUTE_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: ROUTE_LAYER,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#1a8a5f", "line-width": 5, "line-opacity": 0.85 },
    });
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

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

  const gisFeatureCollection = useMemo(() => {
    const features = gisEvidence.data?.features ?? [];
    return {
      type: "FeatureCollection" as const,
      features: features
        .map((f) => {
          const layers = bucketFeature(f);
          const visibleLayer = layers.find((l) => layerVisibility[l]);
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

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildBasemapStyle(basemap),
      center,
      zoom,
      pitch: is3D ? 55 : 0,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new FullscreenControl(), "top-right");

    map.on("load", () => addOverlaySources(map));
    map.on("moveend", () => {
      const c = map.getCenter();
      setCenter([c.lng, c.lat], map.getZoom());
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Intentionally empty deps: the map instance is created once; all
    // reactive updates below use the ref rather than re-creating it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap changes require a style swap, which drops custom sources/layers —
  // re-add them once the new style has finished loading.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(buildBasemapStyle(basemap));
    map.once("style.load", () => {
      addOverlaySources(map);
      syncOverlay(map, selectedLocation, radiusMeters);
      syncGisPoints(map, gisFeatureCollection);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  // GIS feature points follow the layer manager's visibility/opacity state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) syncGisPoints(map, gisFeatureCollection);
    else map.once("load", () => syncGisPoints(map, gisFeatureCollection));
  }, [gisFeatureCollection]);

  // Draw the active route (if any) and fit the map to it.
  useEffect(() => {
    const map = mapRef.current;
    const route = routeQuery.data;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      if (!route) {
        source.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      source.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.geometry } }],
      });

      const bounds = route.geometry.reduce(
        (b, coord) => b.extend(coord as [number, number]),
        new maplibregl.LngLatBounds(route.geometry[0], route.geometry[0])
      );
      map.fitBounds(bounds, { padding: 80, duration: 700 });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [routeQuery.data]);

  useEffect(() => {
    mapRef.current?.easeTo({ pitch: is3D ? 55 : 0, duration: 500 });
  }, [is3D]);

  // Marker + radius circle follow the selected location.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedLocation) {
      markerRef.current?.remove();
      markerRef.current = null;
      syncOverlay(map, null, radiusMeters);
      return;
    }

    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: "#2b5bd7" });
    }
    markerRef.current.setLngLat([selectedLocation.lon, selectedLocation.lat]).addTo(map);

    map.easeTo({ center: [selectedLocation.lon, selectedLocation.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });

    const applyOverlay = () => syncOverlay(map, selectedLocation, radiusMeters);
    if (map.isStyleLoaded()) applyOverlay();
    else map.once("load", applyOverlay);
  }, [selectedLocation, radiusMeters]);

  return (
    <div className="map-view">
      <div ref={containerRef} className="map-view__canvas" role="application" aria-label="Interactive map" />
    </div>
  );
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
