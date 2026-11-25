import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSheet } from "../../src/features/shell/useSheet";
import { useSheetCommandStore } from "../../src/features/shell/sheetCommandStore";

/**
 * Panning the map or starting a measurement on a phone drops the bottom sheet
 * to its peek height, so most of the screen is map again (M5 in
 * docs/audit/BUG_REPORT_2026-11-25.md).
 */
describe("lowering the phone sheet when the map needs the room", () => {
  it("drops from half height to peek", () => {
    const { result } = renderHook(() => useSheet(true, () => {}));
    expect(result.current.detent).toBe("half");
    act(() => useSheetCommandStore.getState().requestLower());
    expect(result.current.detent).toBe("peek");
  });

  it("never raises a sheet that is already low", () => {
    const { result } = renderHook(() => useSheet(true, () => {}));
    act(() => useSheetCommandStore.getState().requestLower());
    expect(result.current.detent).toBe("peek");
    act(() => useSheetCommandStore.getState().requestLower());
    expect(result.current.detent).toBe("peek");
  });

  it("does nothing on desktop, where there is no sheet", () => {
    const { result } = renderHook(() => useSheet(false, () => {}));
    act(() => useSheetCommandStore.getState().requestLower());
    expect(result.current.fraction).toBeNull();
    expect(result.current.detent).toBe("half");
  });

  it("ignores a request made before the sheet opened", () => {
    act(() => useSheetCommandStore.getState().requestLower());
    const { result } = renderHook(() => useSheet(true, () => {}));
    expect(result.current.detent).toBe("half");
  });
});
