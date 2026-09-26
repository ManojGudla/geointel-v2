import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";
import { differenceFromViewer, isKnownTimeZone, placeTime } from "../../src/features/location/placeClock";
import { LocalTime } from "../../src/features/location/LocalTime";

/** The clock shows the PLACE's time, from its zone, never the reader's. */

const NOON_UTC = new Date("2026-09-11T12:00:00Z");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("placeTime", () => {
  it("gives India's time with its half-hour offset", () => {
    expect(placeTime(NOON_UTC, "Asia/Kolkata")).toEqual({
      time: "17:30:00",
      date: "Fri 11 Sep",
      offsetMinutes: 330,
      utcOffset: "UTC+5:30",
    });
  });

  it("follows daylight saving (New York is UTC-4 in September, UTC-5 in January)", () => {
    expect(placeTime(NOON_UTC, "America/New_York")?.utcOffset).toBe("UTC-4");
    expect(placeTime(new Date("2026-01-15T12:00:00Z"), "America/New_York")?.utcOffset).toBe("UTC-5");
  });

  it("rolls the date over where it is already tomorrow", () => {
    expect(placeTime(new Date("2026-09-11T20:00:00Z"), "Pacific/Auckland")?.date).toBe("Sat 12 Sep");
  });

  it("returns nothing for a missing or unknown zone rather than guessing", () => {
    expect(placeTime(NOON_UTC, undefined)).toBeNull();
    expect(placeTime(NOON_UTC, "Mars/Olympus_Mons")).toBeNull();
    expect(isKnownTimeZone("")).toBe(false);
  });
});

describe("differenceFromViewer", () => {
  it("says how far ahead or behind the place is", () => {
    expect(differenceFromViewer(330, 330)).toBe("Same time as you");
    expect(differenceFromViewer(330, 0)).toBe("5 h 30 min ahead of you");
    expect(differenceFromViewer(-240, 330)).toBe("9 h 30 min behind you");
    expect(differenceFromViewer(345, 330)).toBe("15 min ahead of you");
  });
});

describe("<LocalTime>", () => {
  it("ticks every second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON_UTC);
    render(<LocalTime timeZone="Asia/Kolkata" abbreviation="IST" />);
    expect(screen.getByText("17:30:00")).toBeTruthy();
    expect(screen.getByText(/IST, UTC\+5:30/)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("17:30:01")).toBeTruthy();
  });

  it("says Unavailable for a zone it cannot use", () => {
    render(<LocalTime timeZone="Not/AZone" />);
    expect(screen.getByText("Unavailable")).toBeTruthy();
  });
});
