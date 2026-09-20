import { useCallback } from "react";
import { useAnalysisStore } from "@/stores/analysisStore";
import { useGisUiStore } from "@/stores/gisUiStore";
import { useLocationStore } from "@/stores/locationStore";
import { useMapStore } from "@/stores/mapStore";
import { runAnalysis, zoomForRadius, type AnalysisRequest } from "./runAnalysis";
import { layerLabels, layersForRequest } from "./layerSync";
import { useUiStore } from "@/stores/uiStore";

/**
 * The one way an analysis is run, from anywhere in the app.
 *
 * Every entry point - the Analyze panel's controls, the AI command bar, a
 * suggestion chip - goes through this, because running an analysis is not
 * just "fetch and display". It has to move four pieces of state together:
 *
 *   1. the analysis result itself
 *   2. the map's search radius, so the ring drawn on the map is the radius
 *      the answer was actually computed at
 *   3. the visible layers, so the features being counted are the features
 *      being shown
 *   4. the camera, so the result is on screen
 *
 * Split those across call sites and they drift: the AI says "within 5 km"
 * while the map still draws 250 m, or reports nine hospitals while the
 * hospital layer is off. Both are the same failure - the answer and the map
 * disagreeing - and both destroy trust faster than a wrong number would,
 * because the user can see the contradiction.
 */
export function useRunAnalysis() {
  const units = useUiStore((s) => s.units);
  const { setRunning, setResult, setError } = useAnalysisStore();
  const setRadiusMeters = useLocationStore((s) => s.setRadiusMeters);
  const showLayers = useGisUiStore((s) => s.showLayers);
  const requestCamera = useMapStore((s) => s.requestCamera);

  return useCallback(
    async (request: AnalysisRequest) => {
      setRunning();
      try {
        // "Nearest" searches a wide fixed area to find one thing; forcing the
        // map's radius out to 10 km for it would misrepresent the question
        // the user asked, so only bounded operations set the radius.
        if (request.operation !== "nearest") setRadiusMeters(request.radiusMeters);

        const layers = layersForRequest(request);
        if (layers.length) showLayers(layers);

        const result = await runAnalysis(request, units);
        setResult({ ...result, layersUsed: layerLabels(layers) });
        requestCamera({ center: [request.origin.lon, request.origin.lat], zoom: zoomForRadius(request.radiusMeters) });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "The analysis could not be completed.";
        setError(message);
        throw error;
      }
    },
    [setRunning, setResult, setError, setRadiusMeters, showLayers, requestCamera]
  );
}
