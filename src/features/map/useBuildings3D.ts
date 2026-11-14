import { useCallback, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { fetchBuildings, type Bbox, type BuildingDto } from "@/services/buildings";
import { useMapStore } from "@/stores/mapStore";
import { buildingCells, mergeBuildingCells } from "./buildings3d";

const MIN_ZOOM_FOR_3D_BUILDINGS = 16;

export interface Buildings3DResult {
  data: BuildingDto[] | undefined;
  isFetching: boolean;
  /** Every cell failed. A few failed cells still leave buildings worth showing. */
  isError: boolean;
  /** Some cells failed while others loaded. */
  isPartial: boolean;
  refetch: () => void;
}

/**
 * 3D buildings for the area around the map centre, fetched in fixed cells
 * (see buildingCells for why) and merged into one list. Both callers pass the
 * same arguments, so React Query serves them from the same cached cells.
 */
export function useBuildings3D(bbox: Bbox | null, zoom: number, is3D: boolean): Buildings3DResult {
  const center = useMapStore((s) => s.center);
  const enabled = is3D && zoom >= MIN_ZOOM_FOR_3D_BUILDINGS && !!bbox;
  const cells = useMemo(
    () => (enabled ? buildingCells({ lat: center[1], lon: center[0] }, bbox) : []),
    // Only the cell the centre sits in and the view's edges decide this, but
    // recomputing a nine-item list is cheaper than reasoning about that.
    [enabled, center, bbox]
  );

  const queries = useQueries({
    queries: cells.map((cell) => ({
      queryKey: ["buildings3d-cell", cell.key],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchBuildings({ south: cell.south, west: cell.west, north: cell.north, east: cell.east }, signal),
      staleTime: 30 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
    })),
  });

  const lists = queries.map((q) => q.data);
  const data = useMemo(
    () => (enabled && lists.some(Boolean) ? mergeBuildingCells(lists) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, ...lists]
  );
  const failed = queries.filter((q) => q.isError).length;
  const refetchAll = useCallback(() => {
    for (const q of queries) if (q.isError) void q.refetch();
  }, [queries]);

  return {
    data,
    isFetching: queries.some((q) => q.isFetching),
    isError: queries.length > 0 && failed === queries.length,
    isPartial: failed > 0 && failed < queries.length,
    refetch: refetchAll,
  };
}

export { MIN_ZOOM_FOR_3D_BUILDINGS };
