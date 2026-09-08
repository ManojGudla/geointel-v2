import { useCallback, useState } from "react";

export type GeolocationStatus = "idle" | "locating" | "granted" | "denied" | "unsupported" | "error";

interface GeolocationState {
  status: GeolocationStatus;
  coords: { lat: number; lon: number } | null;
  error: string | null;
}

/**
 * Wraps the browser Geolocation API with the states the spec calls for:
 * permission denial must show a clear message and never crash the app.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({ status: "idle", coords: null, error: null });

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState({ status: "unsupported", coords: null, error: "This browser doesn't support location services." });
      return;
    }

    setState((s) => ({ ...s, status: "locating", error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          status: "granted",
          coords: { lat: position.coords.latitude, lon: position.coords.longitude },
          error: null,
        });
      },
      (geoError) => {
        const denied = geoError.code === geoError.PERMISSION_DENIED;
        setState({
          status: denied ? "denied" : "error",
          coords: null,
          error: denied
            ? "Location permission was denied. Search for a place instead."
            : "Couldn't determine your current location. Search for a place instead.",
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }, []);

  return { ...state, locate };
}
