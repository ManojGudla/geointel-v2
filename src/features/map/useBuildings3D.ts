import { useQuery } from "@tanstack/react-query";
import { fetchBuildings, type Bbox } from "@/services/buildings";
import { roundBbox } from "./buildings3d";

const MIN_ZOOM_FOR_3D_BUILDINGS = 16;

export function useBuildings3D(bbox: Bbox | null, zoom: number, is3D: boolean) {
  const enabled = is3D && zoom >= MIN_ZOOM_FOR_3D_BUILDINGS && !!bbox;
  const rounded = bbox ? roundBbox(bbox) : null;

  return useQuery({
    queryKey: ["buildings3d", rounded?.south, rounded?.west, rounded?.north, rounded?.east],
    queryFn: ({ signal }) => fetchBuildings(bbox!, signal),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

export { MIN_ZOOM_FOR_3D_BUILDINGS };
