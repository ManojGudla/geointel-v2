import { useEffect } from "react";
import { useLocationStore } from "@/stores/locationStore";
import { watchLocationForPanel } from "@/stores/shellStore";

/**
 * Keeps the workspace panel in step with location selection - see
 * watchLocationForPanel. Mounted once, at the app root, so every way of
 * selecting a place gets the behaviour without repeating it.
 */
export function useLocationPanelSync() {
  useEffect(
    () =>
      watchLocationForPanel((listener) =>
        useLocationStore.subscribe((state, previous) => {
          if (!!state.selectedLocation !== !!previous.selectedLocation) listener(!!state.selectedLocation);
        })
      ),
    []
  );
}
