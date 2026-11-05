import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useLiveLocationStore, resetLiveLocation, waitForFix } from "../../src/features/location/liveLocationStore";
import { locationHelp, detectPlatform } from "../../src/features/location/locationHelp";

type Success = (p: GeolocationPosition) => void;
type Failure = (e: GeolocationPositionError) => void;

function position(lat: number, lon: number, accuracy: number, timestamp = Date.now()): GeolocationPosition {
  return { coords: { latitude: lat, longitude: lon, accuracy, heading: null, speed: null, altitude: null, altitudeAccuracy: null }, timestamp } as unknown as GeolocationPosition;
}

function geoError(code: 1 | 2 | 3): GeolocationPositionError {
  return { code, message: "", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

let current: { ok: Success; fail: Failure; options?: PositionOptions } | null;
let watch: { ok: Success; fail: Failure; options?: PositionOptions } | null;

beforeEach(() => {
  resetLiveLocation();
  current = null;
  watch = null;
  vi.stubGlobal("navigator", {
    ...navigator,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    geolocation: {
      getCurrentPosition: (ok: Success, fail: Failure, options?: PositionOptions) => (current = { ok, fail, options }),
      watchPosition: (ok: Success, fail: Failure, options?: PositionOptions) => {
        watch = { ok, fail, options };
        return 7;
      },
      clearWatch: vi.fn(),
    },
  });
});

afterEach(() => {
  resetLiveLocation();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("live location (the iPhone fix)", () => {
  it("asks for a quick coarse fix AND a continuous precise one, with no 10-second deadline", () => {
    useLiveLocationStore.getState().start();
    expect(current?.options?.enableHighAccuracy).toBe(false);
    expect(watch?.options?.enableHighAccuracy).toBe(true);
    expect(watch!.options!.timeout!).toBeGreaterThan(10_000);
    expect(useLiveLocationStore.getState().status).toBe("locating");
    expect(useLiveLocationStore.getState().following).toBe(true);
  });

  it("shows the coarse fix at once, then refines it, and never lets a stale coarse fix undo a precise one", () => {
    useLiveLocationStore.getState().start();
    current!.ok(position(17.38, 78.48, 900));
    expect(useLiveLocationStore.getState().status).toBe("tracking");
    expect(useLiveLocationStore.getState().fix!.accuracy).toBe(900);

    watch!.ok(position(17.385, 78.487, 12));
    expect(useLiveLocationStore.getState().fix!.accuracy).toBe(12);

    current!.ok(position(17.3, 78.4, 900));
    expect(useLiveLocationStore.getState().fix!.lat).toBe(17.385);
  });

  it("a timeout before any fix keeps looking instead of giving up", () => {
    useLiveLocationStore.getState().start();
    watch!.fail(geoError(3));
    expect(useLiveLocationStore.getState().status).toBe("locating");
    expect(useLiveLocationStore.getState().error).toBeNull();
  });

  it("when blocked on an iPhone, says exactly where in Settings to turn it on", () => {
    useLiveLocationStore.getState().start();
    watch!.fail(geoError(1));
    const state = useLiveLocationStore.getState();
    expect(state.status).toBe("denied");
    expect(state.error).toMatch(/Settings → Privacy & Security → Location Services/);
    expect(state.error).toMatch(/Safari Websites/);
  });

  it("waitForFix resolves with the next fix (used by the near-me chips)", async () => {
    const pending = waitForFix(5_000);
    current!.ok(position(12.97, 77.59, 30));
    await expect(pending).resolves.toMatchObject({ lat: 12.97, lon: 77.59 });
  });

  it("waitForFix rejects with the help text when location is blocked", async () => {
    const pending = waitForFix(5_000);
    watch!.fail(geoError(1));
    await expect(pending).rejects.toThrow(/Location is blocked/);
  });
});

describe("location help text", () => {
  it("recognises iPhones, iPads posing as Macs, Android and in-app browsers", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5).ios).toBe(true);
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5).ios).toBe(true);
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0).ios).toBe(false);
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 7)", 5).android).toBe(true);
    expect(detectPlatform("Mozilla/5.0 (iPhone) Instagram 300.0", 5).inApp).toBe(true);
  });

  it("tells in-app browser users to open the page in Safari", () => {
    expect(locationHelp("denied", { ios: true, android: false, inApp: true })).toMatch(/Open in Safari/);
  });

  it("gives Android its own steps", () => {
    expect(locationHelp("denied", { ios: false, android: true, inApp: false })).toMatch(/Permissions → Location → Allow/);
  });
});
