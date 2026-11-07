/**
 * Fly maNOWj - the rules, with no drawing and no clock, so they are testable.
 *
 * A tap-to-fly game: the flyer falls under gravity, a tap gives it an upward
 * kick, and it has to pass through gaps between towers. One point per gap,
 * a bonus for each map pin collected, and it slowly speeds up.
 *
 * All units are in "world pixels" on a fixed 360 x 640 world; the screen
 * scales that to whatever size it has, so the game plays identically on a
 * phone and a desktop (a bigger screen must not mean an easier game).
 */

export const WORLD_W = 360;
export const WORLD_H = 640;
export const GROUND_H = 72;
export const FLYER_X = 104;
export const FLYER_R = 21;
export const TOWER_W = 64;

const GRAVITY = 1650; // px/s²
const FLAP_VELOCITY = -470; // px/s
const MAX_FALL = 720;
const START_SPEED = 150; // px/s
const MAX_SPEED = 235;
const START_GAP = 172;
const MIN_GAP = 128;
const SPACING = 210; // px between towers

export interface Tower {
  x: number;
  /** Centre of the gap. */
  gapY: number;
  gap: number;
  passed: boolean;
  /** A collectable map pin in the gap, or null once taken. */
  pin: { y: number; taken: boolean } | null;
}

export type FlyPhase = "ready" | "playing" | "dead";

export interface FlyState {
  phase: FlyPhase;
  y: number;
  vy: number;
  speed: number;
  towers: Tower[];
  score: number;
  pins: number;
  /** World scroll, for the parallax background and the ground stripes. */
  distance: number;
  /** Seconds since the run started, for bobbing and effects. */
  time: number;
  /** Set on the frame something happened, so the screen can play a sound. */
  events: Array<"flap" | "point" | "pin" | "crash" | "ground">;
  /** Seconds of protection left after a second chance; towers cannot hit you while it runs. */
  shield: number;
  /** How many second chances this run has used. */
  revives: number;
}

export interface Random {
  next(): number;
}

export function createFly(): FlyState {
  return { phase: "ready", y: WORLD_H * 0.42, vy: 0, speed: START_SPEED, towers: [], score: 0, pins: 0, distance: 0, time: 0, events: [], shield: 0, revives: 0 };
}

/**
 * A second chance: same run, same score, same speed. The towers right in
 * front of the flyer are cleared so the restart is fair, he hovers until the
 * next tap, and a short shield covers the first moments back in the air.
 */
export function revive(s: FlyState): FlyState {
  return {
    ...s,
    phase: "ready",
    y: WORLD_H * 0.42,
    vy: 0,
    towers: s.towers.filter((t) => t.x > FLYER_X + 150).map((t) => ({ ...t, pin: t.pin ? { ...t.pin } : null })),
    events: [],
    shield: 1.6,
    revives: s.revives + 1,
  };
}

function gapFor(score: number) {
  return Math.max(MIN_GAP, START_GAP - score * 1.6);
}

function spawnTower(x: number, score: number, rng: Random): Tower {
  const gap = gapFor(score);
  const top = 90 + gap / 2;
  const bottom = WORLD_H - GROUND_H - 70 - gap / 2;
  const gapY = top + rng.next() * (bottom - top);
  // Roughly every third gap carries a pin, placed off-centre so taking it is a choice.
  const pin = rng.next() < 0.36 ? { y: gapY + (rng.next() - 0.5) * gap * 0.5, taken: false } : null;
  return { x, gapY, gap, passed: false, pin };
}

export function flap(s: FlyState): FlyState {
  if (s.phase === "dead") return s;
  return { ...s, phase: "playing", vy: FLAP_VELOCITY, events: [...s.events, "flap"] };
}

/** Advances the world by dt seconds (clamped, so a background tab cannot teleport the flyer). */
export function step(prev: FlyState, dtRaw: number, rng: Random): FlyState {
  const dt = Math.min(0.034, Math.max(0, dtRaw));
  const s: FlyState = { ...prev, time: prev.time + dt, events: [] };

  if (s.phase === "ready") {
    // Hover gently until the first tap.
    s.y = WORLD_H * 0.42 + Math.sin(s.time * 4) * 8;
    s.distance += START_SPEED * 0.5 * dt;
    return s;
  }

  if (s.phase === "dead") {
    // Fall to the ground after a crash.
    if (s.y < WORLD_H - GROUND_H - FLYER_R) {
      s.vy = Math.min(MAX_FALL * 1.3, s.vy + GRAVITY * dt);
      s.y = Math.min(WORLD_H - GROUND_H - FLYER_R, s.y + s.vy * dt);
    }
    return s;
  }

  s.shield = Math.max(0, s.shield - dt);
  s.vy = Math.min(MAX_FALL, s.vy + GRAVITY * dt);
  s.y += s.vy * dt;
  s.speed = Math.min(MAX_SPEED, START_SPEED + s.score * 2.2);
  const dx = s.speed * dt;
  s.distance += dx;

  let towers = s.towers.map((t) => ({ ...t, x: t.x - dx, pin: t.pin ? { ...t.pin } : null })).filter((t) => t.x > -TOWER_W - 10);
  const last = towers[towers.length - 1];
  if (!last) towers.push(spawnTower(WORLD_W + 120, s.score, rng));
  else if (last.x < WORLD_W + 40 - SPACING + TOWER_W) towers.push(spawnTower(last.x + SPACING, s.score, rng));

  for (const t of towers) {
    if (!t.passed && t.x + TOWER_W < FLYER_X - FLYER_R) {
      t.passed = true;
      s.score += 1;
      s.events.push("point");
    }
    if (t.pin && !t.pin.taken) {
      const px = t.x + TOWER_W / 2;
      if (Math.hypot(px - FLYER_X, t.pin.y - s.y) < FLYER_R + 12) {
        t.pin.taken = true;
        s.pins += 1;
        s.score += 1;
        s.events.push("pin");
      }
    }
  }
  s.towers = towers;

  // Ceiling: bump and stop rising, do not die - a hard ceiling death feels unfair.
  if (s.y < FLYER_R) {
    s.y = FLYER_R;
    s.vy = 0;
  }

  if (s.y > WORLD_H - GROUND_H - FLYER_R) {
    s.y = WORLD_H - GROUND_H - FLYER_R;
    s.phase = "dead";
    s.events.push("ground");
    return s;
  }

  if (s.shield <= 0 && hitsTower(s.y, towers)) {
    s.phase = "dead";
    s.vy = Math.max(0, s.vy);
    s.events.push("crash");
  }
  return s;
}

/**
 * Circle-versus-rectangle collision, with a few pixels of forgiveness.
 * Players judge collisions by the face, not by its bounding box, and a crash
 * that "didn't touch" is the fastest way to make someone quit.
 */
export function hitsTower(y: number, towers: Tower[]): boolean {
  const r = FLYER_R - 4;
  for (const t of towers) {
    const gapTop = t.gapY - t.gap / 2;
    const gapBottom = t.gapY + t.gap / 2;
    for (const rect of [
      { x: t.x, y: -1000, w: TOWER_W, h: gapTop + 1000 },
      { x: t.x, y: gapBottom, w: TOWER_W, h: WORLD_H - gapBottom },
    ]) {
      const cx = Math.max(rect.x, Math.min(FLYER_X, rect.x + rect.w));
      const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
      if ((cx - FLYER_X) ** 2 + (cy - y) ** 2 < r * r) return true;
    }
  }
  return false;
}

export type Medal = "none" | "bronze" | "silver" | "gold" | "platinum";

export function medalFor(score: number): Medal {
  if (score >= 50) return "platinum";
  if (score >= 30) return "gold";
  if (score >= 20) return "silver";
  if (score >= 10) return "bronze";
  return "none";
}

/* ------------------------------------------------------------------ *
 * Second chances: five a day, kept in this browser.
 * ------------------------------------------------------------------ */

export const DAILY_CHANCES = 5;
const CHANCES_KEY = "manowj.fly.chances.v1";

function today(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Chances left today. A new day refills them. */
export function chancesLeft(now = new Date()): number {
  try {
    const raw = localStorage.getItem(CHANCES_KEY);
    if (!raw) return DAILY_CHANCES;
    const saved = JSON.parse(raw) as { day?: string; left?: number };
    if (saved.day !== today(now) || typeof saved.left !== "number") return DAILY_CHANCES;
    return Math.max(0, Math.min(DAILY_CHANCES, Math.floor(saved.left)));
  } catch {
    return DAILY_CHANCES;
  }
}

/** Spends one chance and returns how many are left (unchanged if none were left). */
export function spendChance(now = new Date()): number {
  const left = chancesLeft(now);
  if (left <= 0) return 0;
  try {
    localStorage.setItem(CHANCES_KEY, JSON.stringify({ day: today(now), left: left - 1 }));
  } catch {
    // Private mode: the chance is still spent for this session.
  }
  return left - 1;
}
