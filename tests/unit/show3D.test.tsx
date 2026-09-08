import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useShow3D } from "@/features/map/useShow3D";
import { MIN_ZOOM_FOR_3D_BUILDINGS } from "@/features/map/useBuildings3D";
import { useMapStore } from "@/stores/mapStore";
import { useShellStore } from "@/stores/shellStore";

/**
 * The reported failure this guards against: press 3D from a city-wide view,
 * the map tilts, and no buildings appear. Footprints are only fetched at
 * zoom 16 and closer, so a toggle that changes the mode without moving the
 * camera is correct and useless at the same time.
 */
beforeEach(() => {
  useMapStore.setState({ is3D: false, zoom: 12, cameraRequest: null });
  useShellStore.setState({ section: "place", open: false });
});

describe("turning 3D on", () => {
  it("flies to a zoom where building footprints actually load", () => {
    const { result } = renderHook(() => useShow3D());
    act(() => result.current.toggle());

    expect(useMapStore.getState().is3D).toBe(true);
    const camera = useMapStore.getState().cameraRequest;
    expect(camera?.zoom).toBeGreaterThanOrEqual(MIN_ZOOM_FOR_3D_BUILDINGS);
    // Named explicitly rather than left to default to the current pitch,
    // which would be zero here and would fight the map's own is3D easing.
    expect(camera?.pitch).toBe(55);
  });

  it("keeps a closer zoom instead of pulling the view back out", () => {
    useMapStore.setState({ zoom: 18.4 });
    const { result } = renderHook(() => useShow3D());
    act(() => result.current.toggle());

    expect(useMapStore.getState().cameraRequest?.zoom).toBe(18.4);
  });

  it("shows the panel that explains what loaded, or why nothing did", () => {
    const { result } = renderHook(() => useShow3D());
    act(() => result.current.toggle());

    expect(useShellStore.getState()).toMatchObject({ section: "layers", open: true });
  });
});

describe("turning 3D off", () => {
  it("changes the mode and issues no competing camera request", () => {
    useMapStore.setState({ is3D: true, zoom: 17, cameraRequest: null });
    const { result } = renderHook(() => useShow3D());
    act(() => result.current.toggle());

    expect(useMapStore.getState().is3D).toBe(false);
    // The map's own is3D effect eases the pitch flat. A request here would
    // reintroduce the same race in the other direction.
    expect(useMapStore.getState().cameraRequest).toBeNull();
  });
});
