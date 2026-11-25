import { useQuery } from "@tanstack/react-query";
import { fetchPropertySite } from "@/services/property";
import { useLocationStore } from "@/stores/locationStore";

/** The building at the selected point. Shared by the Property panel, the report and the AI context, so it is asked for once. */
export function usePropertySite() {
  const location = useLocationStore((s) => s.selectedLocation);
  return useQuery({
    queryKey: ["property-site", location?.lat, location?.lon],
    queryFn: ({ signal }) => fetchPropertySite(location!.lat, location!.lon, signal),
    enabled: !!location,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}
