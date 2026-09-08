import { describe, expect, it } from "vitest";
import {
  DAILY_EPOCH,
  MAX_DAY_SCORE,
  MAX_ROUND_SCORE,
  PERFECT_KM,
  ROUNDS_PER_DAY,
  bandFor,
  formatCountdown,
  formatDistance,
  msUntilNextDay,
  puzzleNumber,
  roundsForDate,
  scoreForDistance,
  scoreGuess,
  shareText,
  totalScore,
  type RoundResult,
} from "../../src/features/play/games/daily/dailyEngine";
import {
  CLUE_COSTS,
  MAX_CLUES,
  applyClueCost,
  clueAt,
  clueMultiplier,
  cluesRevealed,
} from "../../src/features/play/games/daily/dailyEngine";
import {
  DAILY_LOCATIONS,
  REGION_VIEW,
  byDifficulty,
  type DailyRegion,
} from "../../src/features/play/games/daily/dailyLocations";
import { nextStreak, previousDateKey } from "../../src/features/play/games/daily/dailyStore";

/**
 * The Daily Challenge.
 *
 * This game replaced ten that nobody wanted to play twice. Three properties
 * are what make it different, and all three are load-bearing rather than
 * decorative — so each has tests that fail loudly if it is ever broken:
 *
 *   1. Everyone gets the same five places on a given day. Without this a
 *      shared score is meaningless and the whole premise collapses.
 *   2. The shared card never names a place. A card that spoiled the answers
 *      would be posted once and then resented, and the game would not spread.
 *   3. The streak is honest — it continues only from yesterday, and replaying
 *      a day already recorded cannot inflate it.
 */

describe("scoring", () => {
  it("gives a full score for landing on the place", () => {
    expect(scoreForDistance(0)).toBe(MAX_ROUND_SCORE);
    expect(scoreForDistance(PERFECT_KM)).toBe(MAX_ROUND_SCORE);
  });

  it("falls off with distance, and always downward", () => {
    const distances = [0, 5, 25, 100, 300, 1000, 3000, 8000, 20000];
    const scores = distances.map(scoreForDistance);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    }
    expect(scores.at(-1)).toBe(0);
  });

  it("still rewards knowing the right country", () => {
    // The curve exists to reward real knowledge, not pixel precision. A guess
    // a thousand kilometres out is wrong, but it is not the same as guessing
    // the wrong continent, and the score has to say so.
    const country = scoreForDistance(1000);
    const continent = scoreForDistance(4000);
    expect(country).toBeGreaterThan(1000);
    expect(country).toBeLessThan(2500);
    expect(continent).toBeLessThan(200);
  });

  it("never returns a negative or absurd score for bad input", () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const score = scoreForDistance(bad);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(MAX_ROUND_SCORE);
    }
  });

  it("measures the real distance from the guess to the place", () => {
    const location = DAILY_LOCATIONS.find((l) => l.id === "taj-mahal")!;
    const spotOn = scoreGuess(location, { lat: location.lat, lon: location.lon });
    expect(spotOn.distanceKm).toBeLessThan(0.5);
    expect(spotOn.score).toBe(MAX_ROUND_SCORE);

    // Delhi is roughly 180 km from Agra — close enough to score well, far
    // enough not to be free.
    const delhi = scoreGuess(location, { lat: 28.6139, lon: 77.209 });
    expect(delhi.distanceKm).toBeGreaterThan(150);
    expect(delhi.distanceKm).toBeLessThan(250);
    expect(delhi.score).toBeGreaterThan(3500);
    expect(delhi.score).toBeLessThan(MAX_ROUND_SCORE);
  });
});

describe("the day's draw", () => {
  it("gives the same five places to everyone on the same date", () => {
    // The single most important property in the game. Two players, two
    // devices, no server — the day must be identical or a shared score is a
    // lie.
    const a = roundsForDate("2026-09-12").map((l) => l.id);
    const b = roundsForDate("2026-09-12").map((l) => l.id);
    expect(a).toEqual(b);
  });

  it("gives different places on different days", () => {
    const days = ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"];
    const sets = days.map((d) => roundsForDate(d).map((l) => l.id).join(","));
    expect(new Set(sets).size).toBe(days.length);
  });

  it("always draws exactly five, with no place repeated inside a day", () => {
    for (let i = 0; i < 60; i++) {
      const day = new Date(2026, 8, 1 + i);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const ids = roundsForDate(key).map((l) => l.id);
      expect(ids).toHaveLength(ROUNDS_PER_DAY);
      expect(new Set(ids).size).toBe(ROUNDS_PER_DAY);
    }
  });

  it("always mixes two easy, two medium and one hard", () => {
    // A random draw regularly produced five obscure places, which reads as
    // "this game is not for me" on a first visit. The fixed mix is what stops
    // a newcomer bouncing off day one.
    for (let i = 0; i < 40; i++) {
      const key = `2026-10-${String((i % 28) + 1).padStart(2, "0")}`;
      const levels = roundsForDate(key).map((l) => l.difficulty).sort();
      expect(levels).toEqual([1, 1, 2, 2, 3]);
    }
  });
});

describe("the location pool", () => {
  it("has enough of every difficulty to draw a day without repeats", () => {
    expect(byDifficulty(1).length).toBeGreaterThanOrEqual(2);
    expect(byDifficulty(2).length).toBeGreaterThanOrEqual(2);
    expect(byDifficulty(3).length).toBeGreaterThanOrEqual(1);
    // And enough overall that days don't feel repetitive within a fortnight.
    expect(DAILY_LOCATIONS.length).toBeGreaterThanOrEqual(40);
  });

  it("has unique ids", () => {
    const ids = DAILY_LOCATIONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has real coordinates and a real zoom for every place", () => {
    const broken = DAILY_LOCATIONS.filter(
      (l) =>
        !Number.isFinite(l.lat) ||
        !Number.isFinite(l.lon) ||
        l.lat < -90 ||
        l.lat > 90 ||
        l.lon < -180 ||
        l.lon > 180 ||
        // 0,0 is in the Atlantic and is the classic sign of a missing value.
        (l.lat === 0 && l.lon === 0) ||
        l.zoom < 8 ||
        l.zoom > 19
    );
    expect(broken.map((l) => l.id)).toEqual([]);
  });

  it("gives every place a fact worth reading", () => {
    // The fact is the payoff for a wrong guess. A place without one is a
    // place that punishes you for playing.
    const thin = DAILY_LOCATIONS.filter((l) => !l.fact || l.fact.trim().length < 40);
    expect(thin.map((l) => l.id)).toEqual([]);
  });

  it("covers more than a handful of countries", () => {
    // A daily built out of one region stops being interesting on day three.
    const countries = new Set(DAILY_LOCATIONS.map((l) => l.countryCode));
    expect(countries.size).toBeGreaterThanOrEqual(20);
  });
});

describe("the shared card", () => {
  const results: RoundResult[] = roundsForDate("2026-09-12").map((location, i) => ({
    location,
    guess: { lat: location.lat, lon: location.lon },
    distanceKm: i * 400,
    rawScore: scoreForDistance(i * 400),
    score: scoreForDistance(i * 400),
    cluesUsed: 0,
  }));

  it("never names a place, a country or a distance", () => {
    // THE property that lets a daily puzzle spread. If the card spoils the
    // answers, sharing it is antisocial and nobody does it twice.
    const text = shareText(results, "2026-09-12", 3);
    for (const r of results) {
      expect(text).not.toContain(r.location.name);
      expect(text).not.toContain(r.location.country);
      expect(text.toLowerCase()).not.toContain(r.location.id);
    }
    expect(text).not.toMatch(/\bkm\b/);
  });

  it("carries the score, the puzzle number and a link back", () => {
    const text = shareText(results, "2026-09-12", 3);
    expect(text).toContain(`#${puzzleNumber("2026-09-12")}`);
    expect(text).toContain(totalScore(results).toLocaleString());
    expect(text).toContain("manowj.com");
    expect(text).toContain("🔥 3 day streak");
  });

  it("leaves the streak line out when there isn't one worth boasting about", () => {
    expect(shareText(results, "2026-09-12", 1)).not.toContain("streak");
    expect(shareText(results, "2026-09-12", 0)).not.toContain("streak");
  });

  it("has one square per round", () => {
    const text = shareText(results, "2026-09-12", 0);
    const squares = [...text].filter((c) => "🟩🟨🟧🟥⬜".includes(c));
    expect(squares).toHaveLength(ROUNDS_PER_DAY);
  });
});

describe("bands and totals", () => {
  it("maps scores to bands in order", () => {
    expect(bandFor(5000)).toBe("perfect");
    expect(bandFor(4000)).toBe("great");
    expect(bandFor(2500)).toBe("good");
    expect(bandFor(900)).toBe("fair");
    expect(bandFor(0)).toBe("miss");
  });

  it("cannot total more than a perfect day", () => {
    const perfect: RoundResult[] = Array.from({ length: ROUNDS_PER_DAY }, () => ({
      location: DAILY_LOCATIONS[0]!,
      guess: { lat: 0, lon: 0 },
      distanceKm: 0,
      rawScore: MAX_ROUND_SCORE,
      score: MAX_ROUND_SCORE,
      cluesUsed: 0,
    }));
    expect(totalScore(perfect)).toBe(MAX_DAY_SCORE);
  });
});

describe("puzzle numbering", () => {
  it("counts from the launch date", () => {
    expect(puzzleNumber(DAILY_EPOCH)).toBe(1);
    expect(puzzleNumber("2026-09-02")).toBe(2);
    expect(puzzleNumber("2026-10-01")).toBe(31);
  });

  it("keeps counting across a year boundary", () => {
    expect(puzzleNumber("2027-01-01")).toBe(123);
  });
});

describe("streaks", () => {
  it("starts at one for a first-ever play", () => {
    expect(nextStreak(null, 0, "2026-09-12")).toBe(1);
  });

  it("continues when yesterday was played", () => {
    expect(nextStreak("2026-09-11", 4, "2026-09-12")).toBe(5);
  });

  it("resets to one after a missed day", () => {
    // One, not zero: the day just played still counts. Zeroing it would read
    // as a punishment for coming back.
    expect(nextStreak("2026-09-09", 12, "2026-09-12")).toBe(1);
  });

  it("cannot be inflated by replaying the same day", () => {
    // Only reachable through a stale tab, but it would silently corrupt every
    // number on the results screen.
    expect(nextStreak("2026-09-12", 4, "2026-09-12")).toBe(4);
    expect(nextStreak("2026-09-12", 0, "2026-09-12")).toBe(1);
  });

  it("knows what yesterday was across month and year boundaries", () => {
    expect(previousDateKey("2026-10-01")).toBe("2026-09-30");
    expect(previousDateKey("2027-01-01")).toBe("2026-12-31");
    expect(previousDateKey("2028-03-01")).toBe("2028-02-29"); // leap year
  });
});

describe("formatting", () => {
  it("shows metres up close and kilometres further out", () => {
    expect(formatDistance(0.42)).toBe("420 m");
    expect(formatDistance(12.34)).toBe("12.3 km");
    expect(formatDistance(4821)).toBe("4,821 km");
  });

  it("counts down to the next puzzle without going negative", () => {
    expect(formatCountdown(3 * 3600_000 + 7 * 60_000 + 5000)).toBe("3h 07m 05s");
    expect(formatCountdown(-5000)).toBe("0h 00m 00s");
  });

  it("always points at the next local midnight", () => {
    const evening = new Date(2026, 8, 12, 23, 30, 0);
    const ms = msUntilNextDay(evening);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(24 * 3600_000);
    expect(Math.round(ms / 60000)).toBe(30);
  });
});

/**
 * ── Clues ─────────────────────────────────────────────────────────────────
 *
 * These exist because the game shipped without them and was, fairly, called
 * unplayable. From directly overhead a waterfall is a river with white water
 * in it; there is no way to tell one continent's from another's, and a player
 * with no way to reason does not feel challenged, they feel taunted.
 *
 * Two properties have to hold or the clues make things worse rather than
 * better, and both are easy to break by hand across 54 entries:
 *
 *   A clue must not contain the answer. Naming the place or its country turns
 *   a hint into a giveaway and the round into a formality.
 *
 *   A clue must not be wrong. A player pays points for these and then trusts
 *   them, so a mislabelled continent is worse than no clue at all — it sends
 *   someone confidently to the other side of the planet.
 */

/** Phrases that would hand over the answer outright. */
function forbidden(location: (typeof DAILY_LOCATIONS)[number]): string[] {
  return [location.country, ...location.name.split(/[,()]/)]
    .map((s) => s.trim())
    // Short fragments ("Rio", "Pad 39A") match too much ordinary prose to be
    // a useful signal, and would make this test noise instead of a guard.
    .filter((s) => s.length >= 4);
}

/**
 * Loose continent boxes. Deliberately generous — this is checking for a region
 * typed on the wrong entry, not policing exact borders.
 */
const REGION_BOX: Record<DailyRegion, { lat: [number, number]; lon: [number, number] }> = {
  Africa: { lat: [-36, 38], lon: [-20, 52] },
  Asia: { lat: [-12, 78], lon: [25, 180] },
  Europe: { lat: [34, 82], lon: [-25, 45] },
  "North America": { lat: [7, 72], lon: [-170, -52] },
  "South America": { lat: [-56, 13], lon: [-112, -34] },
  Oceania: { lat: [-50, 0], lon: [110, 180] },
  Antarctica: { lat: [-90, -60], lon: [-180, 180] },
};

describe("what a clue costs", () => {
  it("gives the first clue away free", () => {
    // The decision the whole rescue rests on. Being completely stuck with no
    // way forward is the failure worth removing outright, not taxing.
    expect(CLUE_COSTS[0]).toBe(0);
    expect(clueMultiplier(1)).toBe(1);
    expect(applyClueCost(5000, 1)).toBe(5000);
  });

  it("charges for the second and third", () => {
    expect(clueMultiplier(2)).toBeCloseTo(0.8, 5);
    expect(clueMultiplier(3)).toBeCloseTo(0.45, 5);
    expect(applyClueCost(5000, 2)).toBe(4000);
    expect(applyClueCost(5000, 3)).toBe(2250);
  });

  it("still leaves a round worth playing after every clue", () => {
    // If taking all the help left a token score, nobody would take it and the
    // clues would be decoration. 45% of a well-placed pin is a real result.
    expect(clueMultiplier(MAX_CLUES)).toBeGreaterThanOrEqual(0.4);
    // And clearly worse than working it out, or knowing would mean nothing.
    expect(clueMultiplier(MAX_CLUES)).toBeLessThan(0.6);
  });

  it("never goes below zero or above full, whatever it is handed", () => {
    for (const n of [-5, 0, 1, 2, 3, 99, Number.NaN]) {
      const m = clueMultiplier(n);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
    }
    expect(clueMultiplier(0)).toBe(1);
  });

  it("charges the guess, not the distance", () => {
    // The distance measured must not change because help was taken — only what
    // the guess is worth. Otherwise the answer card would tell the player they
    // were further away than they actually were.
    const location = DAILY_LOCATIONS.find((l) => l.id === "taj-mahal")!;
    const guess = { lat: 28.6139, lon: 77.209 };
    const clean = scoreGuess(location, guess, 0);
    const helped = scoreGuess(location, guess, 3);

    expect(helped.distanceKm).toBeCloseTo(clean.distanceKm, 6);
    expect(helped.rawScore).toBe(clean.rawScore);
    expect(helped.score).toBeLessThan(clean.score);
    expect(helped.score).toBe(applyClueCost(clean.rawScore, 3));
    expect(helped.cluesUsed).toBe(3);
  });
});

describe("the clues themselves", () => {
  it("gives every place both written clues, with something in them", () => {
    const thin = DAILY_LOCATIONS.filter(
      (l) => l.clues.length !== 2 || l.clues.some((c) => !c || c.trim().length < 30)
    );
    expect(thin.map((l) => l.id)).toEqual([]);
  });

  it("never names the place or its country", () => {
    // The one rule that would quietly ruin the game. Clue 3 may name a
    // NEIGHBOUR ("the far bank belongs to Zambia") because that rewards
    // knowing something; naming the answer is just the answer.
    const leaks: string[] = [];
    for (const location of DAILY_LOCATIONS) {
      for (const clue of location.clues) {
        for (const phrase of forbidden(location)) {
          if (clue.toLowerCase().includes(phrase.toLowerCase())) {
            leaks.push(`${location.id}: "${phrase}"`);
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it("does not spend a clue repeating the fact or the other clue", () => {
    const lazy = DAILY_LOCATIONS.filter(
      (l) => l.clues[0] === l.clues[1] || l.clues.some((c) => c === l.fact)
    );
    expect(lazy.map((l) => l.id)).toEqual([]);
  });

  it("hands them over one at a time, free one first", () => {
    const location = DAILY_LOCATIONS.find((l) => l.id === "victoria-falls")!;
    expect(cluesRevealed(location, 0)).toEqual([]);
    expect(cluesRevealed(location, 1)).toEqual([`This place is in ${location.region}.`]);
    expect(cluesRevealed(location, 2)).toHaveLength(2);
    expect(cluesRevealed(location, 3)).toEqual([
      `This place is in ${location.region}.`,
      location.clues[0],
      location.clues[1],
    ]);
  });

  it("runs out rather than repeating or crashing", () => {
    const location = DAILY_LOCATIONS[0]!;
    expect(clueAt(location, MAX_CLUES)).toBeNull();
    expect(cluesRevealed(location, 99)).toHaveLength(MAX_CLUES);
  });
});

describe("the free clue is true", () => {
  it("puts every place on the continent it is actually on", () => {
    // A paid-for clue that lies is worse than silence: the player trusts it and
    // commits to the wrong hemisphere.
    const wrong = DAILY_LOCATIONS.filter((l) => {
      const box = REGION_BOX[l.region];
      return l.lat < box.lat[0] || l.lat > box.lat[1] || l.lon < box.lon[0] || l.lon > box.lon[1];
    });
    expect(wrong.map((l) => `${l.id} → ${l.region}`)).toEqual([]);
  });

  it("has a camera for every region a place can be in", () => {
    for (const location of DAILY_LOCATIONS) {
      expect(REGION_VIEW[location.region], location.id).toBeDefined();
    }
  });

  it("frames a continent, not a country and not the whole planet", () => {
    // Too tight and the free clue becomes the answer; too loose and it does
    // nothing for the player who could not aim in the first place.
    for (const [region, view] of Object.entries(REGION_VIEW)) {
      expect(view.zoom, region).toBeGreaterThanOrEqual(1);
      expect(view.zoom, region).toBeLessThanOrEqual(4);
      expect(Math.abs(view.center[0]), region).toBeLessThanOrEqual(180);
      expect(Math.abs(view.center[1]), region).toBeLessThanOrEqual(85);
    }
  });

  it("keeps the far-flung places inside the view it sends you to", () => {
    // Rapa Nui is 3,500 km out into the Pacific. If the South America camera
    // does not reach it, the free clue points at empty ocean.
    const rapaNui = DAILY_LOCATIONS.find((l) => l.id === "easter-island")!;
    const view = REGION_VIEW[rapaNui.region];
    // Rough degrees visible either side of centre at this zoom on a world map.
    const halfSpan = 180 / Math.pow(2, view.zoom);
    expect(Math.abs(rapaNui.lon - view.center[0])).toBeLessThan(halfSpan);
  });
});
