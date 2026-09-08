import { useEffect } from "react";
import { useLocationStore } from "@/stores/locationStore";
import { reverseGeocode } from "@/services/geocode";

/**
 * Makes the "🔗 Share" button (LocationIdentityPanel.tsx) actually work.
 *
 * That button already built a real link — `${origin}/?lat=..&lon=..` — and
 * sent it through the native share sheet or clipboard. But nothing in the
 * app ever read those query params back on load, so opening a shared link
 * just landed on the plain homepage with no location selected: a real bug
 * (this feature LOOKED live — it produced and shared a URL — but the other
 * half, restoring state from it, was never wired up), not a "planned"
 * feature. This is that missing half: on first load, if `lat`/`lon` are in
 * the URL, resolve them the same way "Use My Current Location" does
 * (reverse-geocode for a real address; fall back to a bare coordinate pair
 * if the provider is unreachable, never blocking on it) and select that
 * location — then strip the params so the URL doesn't keep re-triggering
 * this on every reload or interfere with the app's own navigation.
 */
export function useSharedLocationFromUrl() {
  const setSelectedLocation = useLocationStore((s) => s.setSelectedLocation);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const latParam = params.get("lat");
    const lonParam = params.get("lon");
    if (latParam === null || lonParam === null) return;

    const lat = Number(latParam);
    const lon = Number(lonParam);
    /**
     * Range, not just finiteness.
     *
     * `Number.isFinite` happily passes ?lat=999. MapLibre's LngLat throws on
     * any latitude outside ±90, and that throw happens inside an effect with
     * no try/catch — so React unmounts the map AND every panel and shows the
     * error boundary, which does not self-recover. A link is the easiest
     * thing in the world to hand someone, so `?lat=999&lon=0` was a one-click
     * way to break the whole workspace for whoever opened it.
     */
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

    // Strip immediately (not after the fetch resolves) so a slow/failed
    // reverse-geocode can't leave the shared coordinates sitting in the
    // address bar indefinitely, and a page refresh doesn't re-share the
    // same point back into a fresh session.
    const url = new URL(window.location.href);
    url.searchParams.delete("lat");
    url.searchParams.delete("lon");
    window.history.replaceState({}, "", url.toString());

    let cancelled = false;
    reverseGeocode(lat, lon)
      .then((location) => {
        if (!cancelled) setSelectedLocation(location);
      })
      .catch(() => {
        if (cancelled) return;
        // Same honest fallback DirectionsPanel's "Use My Current Location"
        // uses — a real, usable point with no invented address, rather than
        // silently dropping the shared location because reverse geocoding
        // happened to fail.
        setSelectedLocation({
          lat,
          lon,
          displayName: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          name: "Shared location",
          address: {},
          source: "Shared link",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      });

    return () => {
      cancelled = true;
    };
    // Intentionally empty deps — this reads window.location.search exactly
    // once, on first mount, the same "read once, this SPA never navigates
    // between paths" pattern App.tsx already uses for the /admin pathname
    // check right above where this hook is called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
