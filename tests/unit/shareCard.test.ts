import { describe, expect, it } from "vitest";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  buildScoreCard,
  cardFilename,
  formatCardDate,
} from "../../src/features/play/share/shareCard";
import { COUNTRIES } from "../../src/features/play/data/world";
import { accuracy, applyAnswer, initialState } from "../../src/features/play/games/sixty/sixtyEngine";

/**
 * The shareable result card.
 *
 * The drawing itself cannot be asserted in a unit test — canvas does not
 * render under jsdom — so the model is kept separate from the painting and
 * everything worth protecting lives in the model.
 *
 * Two things are worth protecting. First, the card must not spoil the game
 * for whoever it is shared with: a picture travels further than the text
 * score ever did, so a leaked answer does more damage. Second, it must not
 * read as a credential. There are no accounts and no server-side scoring
 * here, so a card that looked like a certificate would be asserting something
 * this system cannot back — on a product whose whole claim is that it does
 * not overclaim.
 */

describe("the card model", () => {
  it("uses the social image size, so nothing is cropped when posted", () => {
    expect(CARD_WIDTH / CARD_HEIGHT).toBeCloseTo(1.905, 2);
  });

  it("formats a big score with separators", () => {
    expect(buildScoreCard({ game: "60 Seconds", score: 12345, stats: [] }).score).toBe("12,345");
  });

  it("shouts the game name and the stat labels", () => {
    const card = buildScoreCard({
      game: "60 Seconds",
      score: 100,
      stats: [{ label: "Accuracy", value: "87%" }],
    });
    expect(card.game).toBe("60 SECONDS");
    expect(card.stats[0]!.label).toBe("ACCURACY");
    // The value is left exactly as given — uppercasing "87%" gains nothing
    // and would mangle anything with a unit in it.
    expect(card.stats[0]!.value).toBe("87%");
  });

  it("never draws more than three figures, however many it is handed", () => {
    // Four would overflow the row and collide with the footer rule.
    const card = buildScoreCard({
      game: "Test",
      score: 1,
      stats: [
        { label: "a", value: 1 },
        { label: "b", value: 2 },
        { label: "c", value: 3 },
        { label: "d", value: 4 },
        { label: "e", value: 5 },
      ],
    });
    expect(card.stats).toHaveLength(3);
    expect(card.stats.map((s) => s.label)).toEqual(["A", "B", "C"]);
  });

  it("dates the card unambiguously", () => {
    // Not 06/09/2026, which is two different days depending on the reader.
    const label = formatCardDate(new Date(2026, 8, 6));
    expect(label).toContain("September");
    expect(label).toContain("2026");
    expect(label).not.toMatch(/^\d+\/\d+/);
  });
});

describe("the filename", () => {
  const card = buildScoreCard({ game: "60 Seconds", score: 1, stats: [] });

  it("says what it is and sorts by date", () => {
    const name = cardFilename(card, new Date(2026, 8, 6));
    expect(name).toBe("manowj-60-seconds-2026-09-06.png");
  });

  it("is safe on every filesystem", () => {
    // A share sheet on Android will happily hand a filename straight to the
    // filesystem, and spaces or punctuation there are how a download fails
    // silently.
    const messy = buildScoreCard({ game: "Pin the Place! / v2", score: 1, stats: [] });
    expect(cardFilename(messy)).toMatch(/^manowj-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.png$/);
  });

  it("pads single-digit months and days", () => {
    expect(cardFilename(card, new Date(2026, 0, 5))).toContain("2026-01-05");
  });
});

describe("the card does not spoil the game", () => {
  it("carries numbers only, never a place name", () => {
    // Built the way the game actually builds it, from a real played state.
    let state = initialState();
    for (let i = 0; i < 9; i++) state = applyAnswer(state, i % 3 !== 0);

    const card = buildScoreCard({
      game: "60 Seconds",
      score: state.score,
      stats: [
        { label: "Correct", value: `${state.correct}/${state.answered}` },
        { label: "Accuracy", value: `${accuracy(state)}%` },
        { label: "Best streak", value: state.longestStreak },
      ],
    });

    const printed = [card.game, card.score, card.dateLabel, ...card.stats.flatMap((s) => [s.label, s.value])]
      .join(" ")
      .toLowerCase();

    for (const country of COUNTRIES) {
      expect(printed, country.name).not.toContain(country.name.toLowerCase());
      expect(printed, country.capital).not.toContain(country.capital.toLowerCase());
    }
  });
});

describe("it is a score, not a credential", () => {
  const card = buildScoreCard({
    game: "60 Seconds",
    score: 3240,
    stats: [{ label: "Accuracy", value: "87%" }],
  });
  const text = [card.game, card.score, card.dateLabel, ...card.stats.map((s) => `${s.label} ${s.value}`)]
    .join(" ")
    .toLowerCase();

  it("makes no claim it cannot back", () => {
    // Every score lives in the player's own browser storage, where anyone can
    // edit it. Wording that implied verification would be a claim with
    // nothing behind it.
    for (const word of ["certificate", "certified", "certify", "awarded", "verified", "official", "accredited"]) {
      expect(text, word).not.toContain(word);
    }
  });

  it("still names the game and the day, so the score means something", () => {
    expect(text).toContain("60 seconds");
    expect(card.dateLabel.length).toBeGreaterThan(6);
  });
});
