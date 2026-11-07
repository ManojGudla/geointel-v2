import type { Rng } from "../../lib/random";
import { contactFor, type Aim, type BallResult, type Contact, type Delivery, type Length, type MatchState, type Outcome } from "./timing";

/**
 * Shot selection for the broadcast-view cricket game.
 *
 * The first version had one input (press when the ball arrives) plus an aim
 * chosen between balls, which made every ball the same decision. Real batting
 * is three decisions made in the moment: WHEN (timing), WHERE (direction) and
 * HOW HARD (defend, keep it on the ground, or go over the top). This file is
 * those rules, pure and testable; the screen only draws what they decide.
 *
 * Direction is in the batter's terms for a right-hander: "off" is the off
 * side (cover, point), "leg" the leg side (midwicket, square leg). In the
 * broadcast view from behind the bowler the off side is on the LEFT of the
 * screen, so a swipe to the left plays through the off side.
 */

export type ShotDir = "off" | "straight" | "leg";
export type ShotKind = "defend" | "ground" | "loft";

export interface Shot {
  dir: ShotDir;
  kind: ShotKind;
}

export const SHOT_KIND_LABEL: Record<ShotKind, string> = {
  defend: "Defend",
  ground: "Ground shot",
  loft: "Loft",
};

/**
 * A swipe on the screen, in pixels (dx right, dy down). Down defends; the
 * horizontal component picks the side; a long swipe, or the LOFT switch,
 * goes over the top.
 */
export function shotFromSwipe(dx: number, dy: number, loft: boolean): Shot {
  const len = Math.hypot(dx, dy);
  if (dy > 24 && dy > Math.abs(dx) * 1.1) return { dir: "straight", kind: "defend" };
  const dir: ShotDir = len < 16 ? "straight" : dx < -Math.abs(dy) * 0.45 ? "off" : dx > Math.abs(dy) * 0.45 ? "leg" : "straight";
  return { dir, kind: loft || len > 150 ? "loft" : "ground" };
}

/** Keyboard: arrows or WASD pick the side, Space plays straight, S/Down defends, Shift lofts. */
export function shotFromKey(code: string, shift: boolean, loft: boolean): Shot | null {
  const kind: ShotKind = shift || loft ? "loft" : "ground";
  switch (code) {
    case "ArrowLeft":
    case "KeyA":
      return { dir: "off", kind };
    case "ArrowRight":
    case "KeyD":
      return { dir: "leg", kind };
    case "ArrowUp":
    case "KeyW":
    case "Space":
    case "Enter":
      return { dir: "straight", kind };
    case "ArrowDown":
    case "KeyS":
      return { dir: "straight", kind: "defend" };
    default:
      return null;
  }
}

/**
 * Which directions suit this ball. A short ball is pulled to the leg side or
 * cut square on the off side; a ball outside off is driven through the off
 * side; one on the pads is flicked to leg; a full straight one goes back past
 * the bowler. Playing against the line still connects, just worse - which is
 * what "playing across the line" means.
 */
export function suitedDirections(length: Length, lineX: number): ShotDir[] {
  if (length === "short" || length === "bouncer") return lineX > 0.1 ? ["leg", "off"] : ["leg"];
  if (length === "yorker") return ["straight", lineX < -0.05 ? "leg" : "off"];
  if (lineX > 0.08) return ["off", "straight"];
  if (lineX < -0.08) return ["leg", "straight"];
  return ["straight", "off", "leg"];
}

const DOWNGRADE: Record<Contact, Contact> = {
  perfect: "great",
  great: "good",
  good: "ok",
  ok: "edge",
  edge: "edge",
  miss: "miss",
};

export type HowOut = "bowled" | "lbw" | "caught" | "caught-behind";

export interface ShotResult extends BallResult {
  shot: Shot | null;
  /** True when the shot suited the ball. */
  suited: boolean;
  howOut?: HowOut;
  /** Where the ball goes, for the aerial camera. Angle in degrees from straight (positive = off side), distance as a fraction of the boundary. */
  landing: { angle: number; distance: number; airborne: boolean } | null;
  /** "Cover drive", "Pull", "Lofted straight"... */
  shotName: string;
}

export function shotName(shot: Shot, length: Length): string {
  const loft = shot.kind === "loft";
  if (shot.kind === "defend") return "Forward defence";
  if (shot.dir === "off") {
    if (length === "short" || length === "bouncer") return loft ? "Upper cut" : "Square cut";
    return loft ? "Lofted cover drive" : "Cover drive";
  }
  if (shot.dir === "leg") {
    if (length === "short" || length === "bouncer") return loft ? "Hook" : "Pull";
    if (length === "yorker") return "Dug out to leg";
    return loft ? "Slog over midwicket" : "Flick off the pads";
  }
  if (length === "yorker") return "Dug out";
  return loft ? "Lofted straight" : "Straight drive";
}

function between(rng: Rng, a: number, b: number) {
  return a + rng.next() * (b - a);
}

/** The aerial angle for a direction: straight is 0, off side positive. */
function angleFor(dir: ShotDir, rng: Rng, edge = false): number {
  if (edge) return dir === "leg" ? -between(rng, 140, 165) : between(rng, 140, 165);
  if (dir === "off") return between(rng, 35, 100);
  if (dir === "leg") return -between(rng, 35, 100);
  return between(rng, -14, 14);
}

const BOWLED_CHANCE: Record<Length, number> = { yorker: 0.92, full: 0.8, good: 0.6, short: 0.2, bouncer: 0.05 };

/**
 * One ball. `offsetMs` is how far from the perfect moment the shot was played
 * (negative early, positive late), or null if no shot was played.
 */
export function resolveShot(offsetMs: number | null, delivery: Delivery, shot: Shot | null, lineX: number, rng: Rng): ShotResult {
  const base = { offsetMs: offsetMs ?? 0 };

  if (offsetMs === null || shot === null) {
    if (rng.next() < BOWLED_CHANCE[delivery.length] * (Math.abs(lineX) < 0.14 ? 1 : 0.25)) {
      return { ...base, outcome: "out", contact: "miss", detail: "Left it. Bowled", shot: null, suited: false, howOut: "bowled", landing: null, shotName: "No shot" };
    }
    return { ...base, outcome: 0, contact: "miss", detail: "Left alone", shot: null, suited: false, landing: null, shotName: "Leave" };
  }

  const suited = suitedDirections(delivery.length, lineX).includes(shot.dir);
  let contact = contactFor(offsetMs, delivery);
  if (!suited) contact = DOWNGRADE[contact];
  const name = shotName(shot, delivery.length);
  const timing = contact === "perfect" || contact === "great" ? "" : offsetMs < 0 ? " (early)" : " (late)";
  const r = (outcome: Outcome, detail: string, landing: ShotResult["landing"], howOut?: HowOut): ShotResult => ({
    ...base,
    outcome,
    contact,
    detail: detail + (outcome === "out" ? "" : timing),
    shot,
    suited,
    howOut,
    landing,
    shotName: name,
  });

  if (contact === "miss") {
    const bowledChance = BOWLED_CHANCE[delivery.length] * (shot.kind === "defend" ? 0.75 : 1) * (Math.abs(lineX) < 0.14 ? 1 : 0.4);
    if (rng.next() < bowledChance) return r("out", "Beaten. Bowled", null, "bowled");
    return r(0, "Played and missed", null);
  }

  if (contact === "edge") {
    const caughtChance = shot.kind === "loft" ? 0.5 : shot.kind === "defend" ? 0.14 : shot.dir === "off" ? 0.38 : 0.22;
    if (rng.next() < caughtChance) {
      if (shot.kind === "loft") return r("out", "Top edge, skied. Caught", { angle: angleFor(shot.dir, rng), distance: between(rng, 0.3, 0.6), airborne: true }, "caught");
      return r("out", "Edged. Caught behind", { angle: between(rng, 172, 180) * (rng.next() < 0.5 ? 1 : -1), distance: 0.08, airborne: true }, "caught-behind");
    }
    const roll = rng.next();
    if (roll < 0.25) return r(4, "Thick edge, runs away for four", { angle: angleFor(shot.dir, rng, true), distance: 1.02, airborne: false });
    if (roll < 0.6) return r(1, "Edged for a single", { angle: angleFor(shot.dir, rng, true), distance: 0.35, airborne: false });
    return r(0, "Inside edge, no run", { angle: angleFor(shot.dir, rng, true), distance: 0.1, airborne: false });
  }

  const angle = angleFor(shot.dir, rng);

  if (shot.kind === "defend") {
    if ((contact === "perfect" || contact === "great") && rng.next() < 0.3) return r(1, "Dabbed into the gap for one", { angle, distance: 0.3, airborne: false });
    return r(0, "Solid defence", { angle, distance: between(rng, 0.04, 0.12), airborne: false });
  }

  if (shot.kind === "ground") {
    if (contact === "perfect") return r(4, `${name}. FOUR!`, { angle, distance: 1.02, airborne: false });
    if (contact === "great") {
      if (rng.next() < 0.72) return r(4, `${name}. Four`, { angle, distance: 1.02, airborne: false });
      return r(2, `${name} for two`, { angle, distance: 0.66, airborne: false });
    }
    if (contact === "good") {
      const roll = rng.next();
      if (roll < 0.22) return r(4, `${name}. Four`, { angle, distance: 1.02, airborne: false });
      if (roll < 0.62) return r(2, `${name}, two runs`, { angle, distance: 0.62, airborne: false });
      return r(1, `${name}, a single`, { angle, distance: 0.42, airborne: false });
    }
    // ok
    return rng.next() < 0.6 ? r(1, "Pushed for one", { angle, distance: 0.38, airborne: false }) : r(0, "Straight to the fielder", { angle, distance: 0.3, airborne: false });
  }

  // Loft: the big shot, and the risky one.
  if (contact === "perfect") return r(6, `${name}. SIX!`, { angle, distance: between(rng, 1.15, 1.4), airborne: true });
  if (contact === "great") {
    if (rng.next() < 0.6) return r(6, `${name}. Six!`, { angle, distance: between(rng, 1.08, 1.25), airborne: true });
    if (rng.next() < 0.12) return r("out", `${name}. Caught on the rope!`, { angle, distance: 0.97, airborne: true }, "caught");
    return r(4, `${name}. One bounce, four`, { angle, distance: 1.02, airborne: true });
  }
  if (contact === "good") {
    const roll = rng.next();
    if (roll < 0.22) return r("out", `${name}. Caught in the deep`, { angle, distance: between(rng, 0.82, 0.95), airborne: true }, "caught");
    if (roll < 0.62) return r(4, `${name}. Four`, { angle, distance: 1.02, airborne: true });
    return r(2, `${name}, drops short, two`, { angle, distance: 0.7, airborne: true });
  }
  // ok: mistimed lofts are how you get out
  if (rng.next() < 0.45) return r("out", `${name}. Mistimed. Caught`, { angle, distance: between(rng, 0.45, 0.7), airborne: true }, "caught");
  return r(1, "Mistimed, lands safe. One", { angle, distance: 0.5, airborne: true });
}

/** Map a shot direction to the aim the match engine records. */
export function aimForShot(shot: Shot | null): Aim {
  return shot?.dir ?? "straight";
}

/** A wide: one run, and the ball is bowled again. */
export function applyWide(state: MatchState): MatchState {
  return { ...state, runs: state.runs + 1 };
}

/** Roughly one ball in thirty is a wide, slightly more from the quick bowlers. */
export function isWide(delivery: Delivery, rng: Rng): boolean {
  return rng.next() < (delivery.bowler === "pace" ? 0.045 : 0.03);
}
