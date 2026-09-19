import { useEffect, useRef, useState } from "react";
import { fetchGISEvidence } from "@/services/gis";
import type { City } from "@/data/cities";
import "./CityMap.css";

/**
 * A working map on the page a stranger actually lands on.
 *
 * These pages had none, and that was a deliberate decision, written into
 * CityPage.css: "no map engine, no panels and no chrome, which keeps it fast,
 * and speed is not a nicety on a page whose only job is to be found and to
 * convert a stranger." The reasoning was right. The conclusion cost the page
 * the thing it was converting people to.
 *
 * Someone searches "Hyderabad map", Google sends them here, and they get
 * text, figures and a button asking them to go and look at a map somewhere
 * else. Google's own summary of this product says it is for analysing places
 * "rather than just viewing them on a static map", while the page it ranks is
 * exactly that.
 *
 * So the speed argument is honoured rather than overruled. The map engine is
 * 787 kB and never appears in this page's initial bundle: it is imported
 * dynamically, after first paint, into a box that already occupies its final
 * height. The text a crawler reads and a reader sees first is unchanged, and
 * nothing moves when the map arrives.
 */
export function CityMap({ city }: { city: City }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"waiting" | "loading" | "ready" | "failed">("waiting");

  /*
    Wait for the browser to be idle before pulling in the map engine, so the
    download never competes with the page's own first paint. requestIdleCallback
    is not in Safari, hence the timeout, and both are capped so the map still
    arrives on a busy machine rather than waiting for an idle moment that
    never comes.
  */
  useEffect(() => {
    let fired = false;
    const start = () => {
      if (fired) return;
      fired = true;
      setPhase("loading");
    };
    const idle = window.requestIdleCallback?.(start, { timeout: 2000 });
    const fallback = window.setTimeout(start, 600);
    return () => {
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      window.clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    if (phase !== "loading" || !containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;
    let map: { remove: () => void } | null = null;

    (async () => {
      try {
        const [maplibre, basemaps] = await Promise.all([
          import("maplibre-gl"),
          import("@/features/map/basemaps"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (cancelled) return;

        const gl = maplibre.default;
        const instance = new gl.Map({
          container,
          style: basemaps.buildBasemapStyle("standard"),
          center: [city.lon, city.lat],
          zoom: city.zoom - 1,
          // A preview, not a workspace. Panning and zooming belong in the app,
          // and a map that swallows scroll on a page people are reading is a
          // well-known way to trap them halfway down it.
          interactive: false,
          attributionControl: { compact: true },
        });
        map = instance;

        instance.on("load", () => {
          if (cancelled) return;
          new gl.Marker({ color: "#1d3f8f" }).setLngLat([city.lon, city.lat]).addTo(instance);
          setPhase("ready");
        });

        /*
          The evidence dots: the one thing that makes this look like this
          product rather than any map. Loaded after the basemap so a slow or
          rate-limited Overpass never delays the picture, and simply absent if
          it fails, because a landing page must not show an error a visitor
          can do nothing about.

          The endpoint is edge-cached for six hours and there are twelve
          cities, so this is twelve cached responses rather than real traffic
          to a free public service.
        */
        try {
          const evidence = await fetchGISEvidence(city.lat, city.lon, 1000);
          if (cancelled || !instance.isStyleLoaded()) return;
          instance.addSource("city-evidence", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: evidence.features.slice(0, 600).map((f) => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [f.lon, f.lat] },
                properties: {},
              })),
            },
          });
          instance.addLayer({
            id: "city-evidence-dots",
            type: "circle",
            source: "city-evidence",
            paint: {
              "circle-radius": 3,
              "circle-color": "#2b5bd7",
              "circle-opacity": 0.55,
              "circle-stroke-width": 0.5,
              "circle-stroke-color": "#ffffff",
            },
          });
        } catch {
          // Deliberately silent. The map is still worth showing without dots.
        }
      } catch {
        if (!cancelled) setPhase("failed");
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [phase, city]);

  // Failure removes the box entirely rather than leaving a grey rectangle:
  // the page below it is complete on its own and always was.
  if (phase === "failed") return null;

  return (
    <div className="city-map">
      <div ref={containerRef} className="city-map__canvas" aria-hidden="true" />
      {phase !== "ready" && (
        <div className="city-map__placeholder">
          <span>Loading the map of {city.name}…</span>
        </div>
      )}
    </div>
  );
}
