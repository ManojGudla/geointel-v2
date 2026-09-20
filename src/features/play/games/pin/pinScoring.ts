import { haversineKm, PLACES, type Place } from "../../data/world";
import { createRng } from "../../lib/random";

/**
 * Scoring for the two "click the map" games: Pin the Place and Map Race.
 *
 * The curve is exponential, not linear. On a world map a linear score makes
 * the whole game feel the same - landing 300 km out and 3,000 km out both
 * read as "some points" - whereas an exponential decay makes precision
 * actually pay, which is what makes people want another go.
 *
 * 5000 points is a perfect pin. The half-life is set so that:
 *   0 km    -> 5000
 *   ~25 km  -> ~4700   (you found the city)
 *   ~150 km -> ~3800   (right area)
 *   ~800 km -> ~1400   (right country-ish)
 *   ~3000 km-> ~50     (wrong continent)
 */
export const MAX_PIN_SCORE = 5000;
const DECAY_KM = 1200;

export function pinScore(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  return Math.round(MAX_PIN_SCORE * Math.exp(-distanceKm / DECAY_KM));
}

export interface PinResult {
  distanceKm: number;
  score: number;
  verdict: string;
  /** Achievement flags this guess earned. */
  flags: string[];
}

/**
 * The verdict is written in plain words rather than a number alone, because
 * "218 km" means nothing to most people and "Close - right city region" does.
 */
export function judgePin(guessLat: number, guessLon: number, target: Place): PinResult {
  const distanceKm = haversineKm(guessLat, guessLon, target.lat, target.lon);
  const score = pinScore(distanceKm);
  const flags: string[] = [];
  if (distanceKm <= 25) flags.push("pin-the-place:within-25km");
  if (distanceKm <= 100) flags.push("pin-the-place:within-100km");

  let verdict: string;
  if (distanceKm <= 25) verdict = "Spot on";
  else if (distanceKm <= 100) verdict = "Very close";
  else if (distanceKm <= 400) verdict = "Right area";
  else if (distanceKm <= 1500) verdict = "Right part of the world";
  else if (distanceKm <= 4000) verdict = "Wrong region";
  else verdict = "Wrong side of the planet";

  return { distanceKm, score, verdict, flags };
}

/** Rounds under 10 km read better in metres. */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

export type PinDifficulty = "easy" | "normal" | "hard";

const FAME_FOR_DIFFICULTY: Record<PinDifficulty, Array<1 | 2 | 3>> = {
  easy: [1],
  normal: [1, 2],
  hard: [1, 2, 3],
};

/**
 * The places for one round. Seeded so the Daily Challenge gives everyone the
 * same set, and distinct so a five-round game can't ask for Mumbai twice.
 */
export function pickRoundPlaces(count: number, difficulty: PinDifficulty, seed: number | string): Place[] {
  const rng = createRng(seed);
  const allowed = FAME_FOR_DIFFICULTY[difficulty];
  const pool = PLACES.filter((p) => allowed.includes(p.fame));
  return rng.sample(pool.length >= count ? pool : PLACES, count);
}
