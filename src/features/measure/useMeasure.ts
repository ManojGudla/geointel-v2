import { useMemo } from "react";
import { useMeasureStore } from "@/stores/measureStore";
import { computeAreaSquareMeters, computeDistanceMeters, outlineCrossesItself } from "./measureMath";
import { formatArea, formatDistance } from "@/features/map/geo";
import { useUiStore } from "@/stores/uiStore";

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
  // The measurement tool is the single place a unit preference matters most,
  // and it was the one place that ignored it.
  const units = useUiStore((s) => s.units);

  const distanceMeters = useMemo(() => (mode === "distance" ? computeDistanceMeters(points) : 0), [mode, points]);
  const areaSquareMeters = useMemo(() => (mode === "area" ? computeAreaSquareMeters(points) : 0), [mode, points]);
  const crosses = useMemo(() => mode === "area" && outlineCrossesItself(points), [mode, points]);

  return {
    mode,
    points,
    setMode,
    undoPoint,
    clear,
    /** True when the area outline crosses itself, so no area can be given. */
    crosses,
    // A dash until there is something to measure. "0 m" and "0 m²" before the
    // second or third point read as a measurement of zero, which it is not.
    distanceLabel: points.length < 2 ? "—" : formatDistance(distanceMeters, units, true),
    areaLabel: points.length < 3 ? "—" : crosses ? "Lines cross" : formatArea(areaSquareMeters, units),
  };
}
