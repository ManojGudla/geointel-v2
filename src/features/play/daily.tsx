import { DailyChallenge as DailyGame } from "./games/daily/DailyChallenge";
import { localDateKey } from "./lib/random";
import { puzzleNumber } from "./games/daily/dailyEngine";

/**
 * The Daily Challenge the hub's hero card launches.
 *
 * This used to rotate between three existing games with the date as a seed.
 * That gave everyone the same round, which was the right instinct, but it was
 * still just one of the ordinary games replayed - no streak, no result worth
 * sharing, nothing learned, and no reason to be there rather than in the
 * game's own card two rows below.
 *
 * It is now one purpose-built game: five satellite views a day, scored by how
 * close your pin lands, with a spoiler-free result card and a streak. The
 * rotation is gone deliberately - a daily habit needs the same shape every
 * day, and "today it's a quiz, tomorrow it's a map" is not a habit, it is a
 * surprise.
 */

export interface DailyChallenge {
  date: string;
  title: string;
  description: string;
}

export function dailyChallengeFor(date: string = localDateKey()): DailyChallenge {
  return {
    date,
    title: `maNOWj Daily #${puzzleNumber(date)}`,
    description: "Five satellite views, no labels. Drop a pin on each. Same five places for everyone today.",
  };
}

export function renderDaily(_challenge: DailyChallenge, onBackToHub: () => void) {
  return <DailyGame onBackToHub={onBackToHub} />;
}

/** Friendly date for the daily card, e.g. "Tuesday 1 September". */
export function friendlyDate(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
