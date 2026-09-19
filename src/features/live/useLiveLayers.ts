import { useQuery } from "@tanstack/react-query";
import { fetchAirQuality, fetchEarthquakes, fetchRadarFrame } from "@/services/live";
import { useLiveLayerStore } from "@/stores/liveLayerStore";
import { useLocationStore } from "@/stores/locationStore";

/**
 * Each live layer only fetches while it is switched on (`enabled`), so an
 * unused layer costs nothing — no request, no polling, no load on a public
 * service. Refetch intervals match how fast the underlying data actually
 * moves, not how fast a dashboard could theoretically poll.
 */

export function useEarthquakes() {
  const on = useLiveLayerStore((s) => s.enabled.earthquakes);
  const window = useLiveLayerStore((s) => s.quakeWindow);

  return useQuery({
    queryKey: ["live-earthquakes", window],
    queryFn: ({ signal }) => fetchEarthquakes(window, signal),
    enabled: on,
    staleTime: 5 * 60 * 1000,
    refetchInterval: on ? 5 * 60 * 1000 : false,
  });
}

export function useRadarFrame() {
  const on = useLiveLayerStore((s) => s.enabled.radar);

  return useQuery({
    queryKey: ["live-radar"],
    queryFn: ({ signal }) => fetchRadarFrame(signal),
    enabled: on,
    staleTime: 4 * 60 * 1000,
    refetchInterval: on ? 4 * 60 * 1000 : false,
  });
}

/**
 * Air quality is a reading for the selected point rather than a map layer —
 * CAMS publishes it on a grid far coarser than anything worth drawing as
 * tiles, so presenting it as a shaded overlay would imply a precision the
 * data does not have. It's shown as a number, where a number is honest.
 */
export function useAirQuality() {
  const location = useLocationStore((s) => s.selectedLocation);

  return useQuery({
    queryKey: ["live-air-quality", location?.lat, location?.lon],
    queryFn: ({ signal }) => fetchAirQuality(location!.lat, location!.lon, signal),
    enabled: !!location,
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * European AQI bands, as published by the European Environment Agency.
 * Returned as a label plus a colour so the UI never invents its own
 * thresholds for what counts as "bad air".
 */
/**
 * Readable ink for a given band colour.
 *
 * The badge painted every band white, and two of the six are light: "Fair"
 * (#6fbf4b) and "Moderate" (#e0a825) put white text at roughly 2.2:1, well
 * under the 4.5:1 floor, so the label was near-invisible in both themes on
 * exactly the readings a person is most likely to be checking.
 *
 * The band colours themselves are published by the EEA and are not ours to
 * adjust, so the text moves instead. Relative luminance per WCAG, with the
 * threshold at the point where dark ink overtakes white.
 */
export function readableInkOn(hex: string): string {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = parseInt(hex.replace("#", ""), 16);
  const luminance =
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);

  /*
    Both candidates measured properly, against their own luminance.

    The first version compared white against a hypothetical PURE black while
    actually painting #101828, which overstated the dark option: the "Good"
    band picked dark ink and landed at 4.09:1, under the floor, having been
    scored as 4.85. Black rather than the app's ink token for the same
    reason: on the darkest band it is the only one of the two that clears
    4.5, and these pills sit on their own colour rather than on a themed
    surface, so there is nothing for a token to stay in step with.
  */
  const againstWhite = 1.05 / (luminance + 0.05);
  const againstBlack = (luminance + 0.05) / 0.05;
  return againstWhite >= againstBlack ? "#ffffff" : "#000000";
}

export function aqiBand(aqi: number | null): { label: string; color: string; textColor: string } {
  const band = (label: string, color: string) => ({ label, color, textColor: readableInkOn(color) });
  if (aqi === null) return band("Unknown", "#8b93a7");
  if (aqi <= 20) return band("Good", "#1a8a5f");
  if (aqi <= 40) return band("Fair", "#6fbf4b");
  if (aqi <= 60) return band("Moderate", "#e0a825");
  if (aqi <= 80) return band("Poor", "#e07325");
  if (aqi <= 100) return band("Very poor", "#c82828");
  return band("Extremely poor", "#8b1a4a");
}
