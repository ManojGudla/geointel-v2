import { useQuery } from "@tanstack/react-query";
import { fetchGISEvidence } from "@/services/gis";
import { useLocationStore } from "@/stores/locationStore";

export function useGisEvidence() {
  const location = useLocationStore((s) => s.selectedLocation);
  const radiusMeters = useLocationStore((s) => s.radiusMeters);

  return useQuery({
    queryKey: ["gis-evidence", location?.lat, location?.lon, radiusMeters],
    queryFn: ({ signal }) => fetchGISEvidence(location!.lat, location!.lon, radiusMeters, signal),
    enabled: !!location,
    staleTime: 5 * 60 * 1000,
  });
}
