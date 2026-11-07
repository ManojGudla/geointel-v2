import { describe, expect, it } from "vitest";
import {
  EMPTY_MEMORY,
  MAX_NUDGES,
  NUDGE_AFTER_MS,
  dayKey,
  markPlayed,
  markShown,
  nudgeAllowedToday,
  shouldNudge,
} from "../../src/features/play/nudge/gamesNudgeRules";

const today = new Date(2026, 10, 7, 14, 0, 0);
const tomorrow = new Date(2026, 10, 8, 9, 0, 0);

describe("games pop-up rules", () => {
  it("waits for real use before appearing", () => {
    expect(shouldNudge(EMPTY_MEMORY, NUDGE_AFTER_MS - 1_000, false, today)).toBe(false);
    expect(shouldNudge(EMPTY_MEMORY, NUDGE_AFTER_MS, false, today)).toBe(true);
  });

  it("never covers a dialog, the consent banner, the tour or onboarding", () => {
    expect(shouldNudge(EMPTY_MEMORY, NUDGE_AFTER_MS * 10, true, today)).toBe(false);
  });

  it("appears at most once a day", () => {
    const shown = markShown(EMPTY_MEMORY, today);
    expect(shown.lastDay).toBe(dayKey(today));
    expect(nudgeAllowedToday(shown, today)).toBe(false);
    expect(nudgeAllowedToday(shown, tomorrow)).toBe(true);
  });

  it(`stops after ${MAX_NUDGES} appearances in total`, () => {
    let memory = { ...EMPTY_MEMORY };
    for (let i = 0; i < MAX_NUDGES; i += 1) memory = markShown(memory, new Date(2026, 0, 1 + i));
    expect(nudgeAllowedToday(memory, tomorrow)).toBe(false);
  });

  it("never appears again once the visitor has opened the games", () => {
    expect(nudgeAllowedToday(markPlayed(EMPTY_MEMORY), tomorrow)).toBe(false);
  });

  it("uses the local calendar day", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
