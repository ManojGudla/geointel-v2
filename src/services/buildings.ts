import { apiGet } from "@/services/apiClient";

export interface BuildingDto {
  id: number;
  polygon: Array<[number, number]>;
  heightMeters: number;
  heightIsEstimated: boolean;
  name?: string;
}

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export async function fetchBuildings(bbox: Bbox, signal?: AbortSignal): Promise<BuildingDto[]> {
  const { buildings } = await apiGet<{ buildings: BuildingDto[] }>(
    "/api/buildings",
    { south: bbox.south, west: bbox.west, north: bbox.north, east: bbox.east },
    signal
  );
  return buildings;
}
