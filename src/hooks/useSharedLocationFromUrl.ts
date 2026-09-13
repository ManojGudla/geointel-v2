import { useEffect } from "react";
import { useLocationStore } from "@/stores/locationStore";
import { useMapStore } from "@/stores/mapStore";
import { useShellStore } from "@/stores/shellStore";
import { useIntelTabStore } from "@/stores/intelTabStore";
import { reverseGeocode } from "@/services/geocode";
import { decodeViewState, VIEW_PARAMS } from "@/features/share/viewState";
import { track } from "@/services/analytics";

/**
 * Opening a shared link, and putting back everything it carried.
 *
 * This hook used to read `lat` and `lon` and nothing else, because that was all
 * a share link contained. It now restores the whole view — zoom, basemap,
 * radius, which panel and tab were open, and the question that produced the
 * result — so a link recreates what the sender was looking at rather than the
 * coordinates underneath it. See features/share/viewState.ts for the format and
 * for why every field is validated rather than clamped.
 *
 * Old links keep working unchanged. A URL with only `lat` and `lon` decodes to
 * a view with no optional fields, and every restore below is conditional, so a
 * link shared last month behaves exactly as it did then.
 *
 * ORDER MATTERS HERE, and it is the one thing easy to get wrong.
 *
 * The map camera is requested BEFORE the reverse geocode is awaited. The
 * geocode is a network call to a rate-limited free service and can take
 * seconds or fail outright; making the camera wait on it would leave a person
 * who followed a link to a specific street staring at the default world view
 * until an unrelated request came back. The position is already known from the
 * URL — nothing about showing it depends on knowing its address.
 *
 * The panel state is restored AFTER the location is set, because setting a
 * location fires watchLocationForPanel, which force-opens Explore on the
 * transition from "nothing selected" to "something selected". Restoring the
 * panel first would have it immediately overwritten, and the bug would look
 * like "the section parameter does nothing sometimes" — sometimes, because it
 * would depend on whether the geocode resolved before or after.
 */
export function useSharedLocationFromUrl() {
  const setSelectedLocation = useLocationStore((s) => s.setSelectedLocation);

  useEffect(() => {
    const view = decodeViewState(window.location.search);
    if (!view) return;

    // Everything that does not need the network happens now, in the same tick
    // the page opens.
    if (view.basemap) useMapStore.getState().setBasemap(view.basemap);
    useMapStore.getState().requestCamera({ center: [view.lon, view.lat], zoom: view.zoom ?? 15 });
    if (view.radiusMeters !== undefined) useLocationStore.getState().setRadiusMeters(view.radiusMeters);

    /*
      Stripped immediately, not after the geocode resolves.

      A slow or failed lookup would otherwise leave the shared coordinates
      sitting in the address bar indefinitely, and a refresh would re-trigger
      the whole restore against a session that has already moved on.
    */
    const url = new URL(window.location.href);
    for (const key of VIEW_PARAMS) url.searchParams.delete(key);
    window.history.replaceState({}, "", url.toString());

    track("map_opened", {
      source: "shared-link",
      // Whether a link carried a real view or just a pin is the measure of
      // whether this feature is doing anything. No coordinates, no question
      // text — see services/analytics.ts.
      restoredView: Boolean(view.zoom || view.basemap || view.radiusMeters || view.section || view.question),
    });

    const applyPanel = () => {
      if (view.section) useShellStore.getState().openSection(view.section);
      if (view.tab) useIntelTabStore.getState().setTab(view.tab);
    };

    let cancelled = false;
    reverseGeocode(view.lat, view.lon)
      .then((location) => {
        if (cancelled) return;
        setSelectedLocation(location);
        applyPanel();
      })
      .catch(() => {
        if (cancelled) return;
        // A real, usable point with no invented address, rather than silently
        // dropping the shared location because a free geocoder happened to be
        // rate-limited at that moment.
        setSelectedLocation({
          lat: view.lat,
          lon: view.lon,
          displayName: `${view.lat.toFixed(5)}, ${view.lon.toFixed(5)}`,
          name: "Shared location",
          address: {},
          source: "Shared link",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        applyPanel();
      });

    return () => {
      cancelled = true;
    };
    // Intentionally empty deps — this reads window.location.search exactly once
    // on first mount, the same "read once, this SPA never navigates between
    // paths" pattern App.tsx uses for its pathname check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
