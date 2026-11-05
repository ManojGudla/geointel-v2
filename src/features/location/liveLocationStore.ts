import { create } from "zustand";
import { locationHelp } from "./locationHelp";

/**
 * The visitor's own live position: one tracker shared by the "locate me"
 * button, the blue dot on the map, the search box's "Use my location" and the
 * near-me chips.
 *
 * Why this replaced a single getCurrentPosition call - and why iPhones in
 * particular were failing:
 *
 *  1. TIMEOUT. The old call asked for a high-accuracy fix within 10 seconds.
 *     An iPhone's first GPS fix indoors or after a while asleep routinely
 *     takes longer, so Safari reported TIMEOUT and the app said it "couldn't
 *     determine your location" while the phone was still getting one. Now a
 *     quick, coarse fix (Wi-Fi / cell, usually under a second) is shown at
 *     once, and a continuous high-accuracy watch refines it with no hard
 *     deadline.
 *
 *  2. DENIED WITH NO WAY OUT. iOS denies location for a website whenever
 *     Location Services, or "Safari Websites", is switched off in Settings,
 *     and in-app browsers (Instagram, Facebook, LinkedIn) often deny it
 *     outright. The old message was "Location permission was denied. Search
 *     for a place instead." Now it says what to change, on that device - see
 *     locationHelp.ts.
 *
 *  3. COMPASS. iOS only gives web pages the compass after
 *     DeviceOrientationEvent.requestPermission(), and only from inside a tap.
 *     start() is therefore always called from a tap handler, and asks for it
 *     there, before anything is awaited.
 */

export type LiveStatus = "off" | "locating" | "tracking" | "denied" | "unavailable" | "unsupported";

export interface LiveFix {
  lat: number;
  lon: number;
  /** Radius in metres the device is ~68% sure the true position lies within. */
  accuracy: number;
  /** Direction of travel from GPS, degrees clockwise from north, when moving. */
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

interface LiveLocationState {
  status: LiveStatus;
  fix: LiveFix | null;
  /** Compass heading (degrees from north) from the device's orientation sensor, when allowed. */
  compassHeading: number | null;
  /** Keep the map centred on the dot. Turned off as soon as the user pans the map. */
  following: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  setFollowing: (following: boolean) => void;
}

let watchId: number | null = null;
let orientationListening = false;

/** iOS reports a true compass heading; elsewhere, absolute orientation alpha is counter-clockwise. */
function onOrientation(event: DeviceOrientationEvent) {
  const webkit = (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
  let heading: number | null = null;
  if (typeof webkit === "number" && Number.isFinite(webkit)) heading = webkit;
  else if (event.absolute && typeof event.alpha === "number") heading = (360 - event.alpha) % 360;
  if (heading === null) return;
  const previous = useLiveLocationStore.getState().compassHeading;
  // Sensors jitter by a degree or two constantly; re-rendering the map for
  // that is waste and makes the cone shimmer.
  if (previous !== null && Math.abs(((heading - previous + 540) % 360) - 180) < 3) return;
  useLiveLocationStore.setState({ compassHeading: Math.round(heading) });
}

function listenToCompass() {
  if (orientationListening || typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;
  const attach = () => {
    if (orientationListening) return;
    orientationListening = true;
    // "deviceorientationabsolute" is Chrome on Android's true-north event;
    // iOS only fires "deviceorientation", with webkitCompassHeading on it.
    window.addEventListener("deviceorientationabsolute" as "deviceorientation", onOrientation as EventListener, true);
    window.addEventListener("deviceorientation", onOrientation, true);
  };
  const ctor = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> };
  if (typeof ctor.requestPermission === "function") {
    // iOS 13+: must be called synchronously inside the tap that called start().
    ctor
      .requestPermission()
      .then((answer) => {
        if (answer === "granted") attach();
      })
      .catch(() => {
        // No compass: the dot still works, it just has no direction cone.
      });
  } else {
    attach();
  }
}

function stopCompass() {
  if (!orientationListening) return;
  window.removeEventListener("deviceorientationabsolute" as "deviceorientation", onOrientation as EventListener, true);
  window.removeEventListener("deviceorientation", onOrientation, true);
  orientationListening = false;
}

function toFix(position: GeolocationPosition): LiveFix {
  const { latitude, longitude, accuracy, heading, speed } = position.coords;
  return {
    lat: latitude,
    lon: longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : 1000,
    heading: typeof heading === "number" && Number.isFinite(heading) && (speed ?? 0) > 0.5 ? heading : null,
    speed: typeof speed === "number" && Number.isFinite(speed) ? speed : null,
    timestamp: position.timestamp || Date.now(),
  };
}

function accept(position: GeolocationPosition) {
  const next = toFix(position);
  const current = useLiveLocationStore.getState().fix;
  // A coarse network fix that arrives after a precise GPS one must not
  // replace it - that made the dot jump hundreds of metres and back.
  if (current && next.accuracy > current.accuracy * 2 && next.timestamp - current.timestamp < 15_000) return;
  useLiveLocationStore.setState({ status: "tracking", fix: next, error: null });
}

function fail(error: GeolocationPositionError) {
  const state = useLiveLocationStore.getState();
  if (error.code === error.PERMISSION_DENIED) {
    stopWatching();
    useLiveLocationStore.setState({ status: "denied", following: false, error: locationHelp("denied") });
    return;
  }
  // TIMEOUT or POSITION_UNAVAILABLE while we already have a fix: keep the
  // last good position on screen and let the watch carry on.
  if (state.fix) return;
  if (error.code === error.POSITION_UNAVAILABLE) {
    useLiveLocationStore.setState({ status: "unavailable", error: locationHelp("unavailable") });
  }
  // A TIMEOUT with no fix yet: stay "locating". The watch keeps going, and
  // the quick coarse fix normally lands first anyway.
}

function stopWatching() {
  if (watchId !== null && typeof navigator !== "undefined" && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
  stopCompass();
}

export const useLiveLocationStore = create<LiveLocationState>((set, get) => ({
  status: "off",
  fix: null,
  compassHeading: null,
  following: false,
  error: null,

  start: () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      set({ status: "unsupported", error: locationHelp("unsupported") });
      return;
    }
    // Asked for here, synchronously inside the tap, because iOS refuses it anywhere else.
    listenToCompass();

    set({ following: true, error: null, status: get().fix ? "tracking" : "locating" });
    if (watchId !== null) return;

    // Fast, coarse first: usually answers in well under a second from Wi-Fi
    // or the cell network, so the dot appears immediately.
    navigator.geolocation.getCurrentPosition(accept, fail, { enableHighAccuracy: false, maximumAge: 120_000, timeout: 8_000 });
    // Then precise and continuous. No short deadline: a first GPS fix can take
    // 20-30 seconds indoors, and the coarse fix covers the wait.
    watchId = navigator.geolocation.watchPosition(accept, fail, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 60_000 });

    // If nothing at all has arrived after 20s and nothing has failed, say so
    // instead of spinning forever.
    window.setTimeout(() => {
      const s = useLiveLocationStore.getState();
      if (s.status === "locating" && !s.fix) set({ status: "unavailable", error: locationHelp("slow") });
    }, 20_000);
  },

  stop: () => {
    stopWatching();
    set({ status: "off", following: false, compassHeading: null });
  },

  setFollowing: (following) => set({ following }),
}));

/**
 * Resolves with the next usable fix, starting the tracker if needed. Used by
 * the near-me chips, which want "where I am" and can wait a few seconds for
 * it. Must be called from a tap, for the same iOS reason as start().
 */
export function waitForFix(timeoutMs = 12_000): Promise<LiveFix> {
  const store = useLiveLocationStore;
  const existing = store.getState().fix;
  if (existing && store.getState().status === "tracking") return Promise.resolve(existing);
  store.getState().start();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      unsubscribe();
      reject(new Error(store.getState().error ?? locationHelp("slow")));
    }, timeoutMs);
    const unsubscribe = store.subscribe((state) => {
      if (state.fix) {
        window.clearTimeout(timer);
        unsubscribe();
        resolve(state.fix);
      } else if (state.status === "denied" || state.status === "unsupported") {
        window.clearTimeout(timer);
        unsubscribe();
        reject(new Error(state.error ?? locationHelp("denied")));
      }
    });
  });
}

/** Test hook. */
export function resetLiveLocation() {
  stopWatching();
  useLiveLocationStore.setState({ status: "off", fix: null, compassHeading: null, following: false, error: null });
}
