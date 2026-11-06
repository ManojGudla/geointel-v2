import { describe, expect, it, beforeEach } from "vitest";
import { reserveNominatimSlot, resetNominatimPacing, NominatimBusyError } from "../../api/_lib/nominatim";

describe("Nominatim pacing (max 1 request per second)", () => {
  beforeEach(() => resetNominatimPacing());

  it("sends the first request at once and spaces the next ones out", () => {
    const t = 1_000_000;
    expect(reserveNominatimSlot(t)).toBe(0);
    expect(reserveNominatimSlot(t)).toBe(1100);
    expect(reserveNominatimSlot(t + 500)).toBe(1700);
  });

  it("refuses instead of queueing far into the future", () => {
    const t = 2_000_000;
    reserveNominatimSlot(t);
    reserveNominatimSlot(t);
    reserveNominatimSlot(t);
    expect(() => reserveNominatimSlot(t)).toThrow(NominatimBusyError);
  });

  it("frees up again once time has passed", () => {
    const t = 3_000_000;
    reserveNominatimSlot(t);
    reserveNominatimSlot(t);
    expect(reserveNominatimSlot(t + 10_000)).toBe(0);
  });
});
