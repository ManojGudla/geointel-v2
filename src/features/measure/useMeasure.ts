import { useMemo } from "react";
import { useMeasureStore } from "@/stores/measureStore";
import { computeAreaSquareMeters, computeDistanceMeters, formatArea, formatDistance } from "./measureMath";

/**
 * Live readout for the MeasureToolbar: recomputes distance/area from the
 * store's points on every change. Cheap enough (turf on a handful of
 * vertices) to run on each render rather than memoizing across renders.
 */
export function useMeasure() {
  const mode = useMeasureStore((s) => s.mode);
  const points = useMeasureStore((s) => s.points);
  const setMode = useMeasureStore((s) => s.setMode);
  const undoPoint = useMeasureStore((s) => s.undoPoint);
  const clear = useMeasureStore((s) => s.clear);

  const distanceMeters = useMemo(() => (mode === "distance" ? computeDistanceMeters(points) : 0), [mode, points]);
  const areaSquareMeters = useMemo(() => (mode === "area" ? computeAreaSquareMeters(points) : 0), [mode, points]);

  return {
    mode,
    points,
    setMode,
    undoPoint,
    clear,
    distanceLabel: formatDistance(distanceMeters),
    areaLabel: formatArea(areaSquareMeters),
  };
}
