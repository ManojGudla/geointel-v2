import { useQuery } from "@tanstack/react-query";
import { fetchOfficials } from "@/services/officials";
import { useLocationStore } from "@/stores/locationStore";

/**
 * Official / Authority Intelligence for the selected location — shared by
 * OfficialsPanel.tsx and useCopilotContext.ts (so the AI layer reasons over
 * the exact same verified-or-unavailable data the panel shows, never a
 * separate copy it could get out of sync with).
 */
export function useOfficials() {
  const location = useLocationStore((s) => s.selectedLocation);
  const countryCode = location?.address.countryCode;

  return useQuery({
    queryKey: ["officials", countryCode, location?.address.stateCode, location?.address.state, location?.address.district, location?.address.city],
    queryFn: ({ signal }) => fetchOfficials(location!.address, signal),
    enabled: !!location && !!countryCode,
    // Officeholders change on the order of years, not minutes — a long
    // staleTime avoids re-querying Wikidata every time the same location is
    // revisited in a session.
    staleTime: 60 * 60 * 1000,
  });
}
