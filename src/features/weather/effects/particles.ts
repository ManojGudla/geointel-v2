import type { WeatherEffect } from "./weatherEffects";

/**
 * The particle simulation, kept out of React entirely.
 *
 * Every field is a plain number in a flat array-of-objects; the renderer only
 * ever mutates them in place. React state for 900 raindrops at 60fps would
 * re-render the tree 60 times a second, which is the difference between an
 * effect nobody notices and an effect that makes the map unusable.
 */
export interface Particle {
  x: number;
  y: number;
  /** Pixels per second. */
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  /** Snow drifts sideways; this is its phase in that oscillation. */
  phase: number;
}

export interface Field {
  width: number;
  height: number;
  effect: WeatherEffect;
}

function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function spawnParticle(field: Field, atTop = false): Particle {
  const { width, height, effect } = field;
  const y = atTop ? random(-height * 0.2, 0) : random(0, height);

  switch (effect) {
    case "rain":
      return { x: random(0, width), y, vx: random(-40, -10), vy: random(700, 1100), size: random(9, 18), opacity: random(0.25, 0.5), phase: 0 };
    case "storm":
      return { x: random(0, width), y, vx: random(-140, -70), vy: random(950, 1400), size: random(12, 22), opacity: random(0.3, 0.55), phase: 0 };
    case "snow":
      return { x: random(0, width), y, vx: random(-14, 14), vy: random(28, 70), size: random(1.6, 3.6), opacity: random(0.5, 0.9), phase: random(0, Math.PI * 2) };
    case "clouds":
      return { x: random(0, width), y: random(0, height * 0.55), vx: random(-14, -4), vy: 0, size: random(90, 220), opacity: random(0.05, 0.12), phase: 0 };
    case "fog":
      return { x: random(0, width), y: random(0, height), vx: random(-9, -2), vy: 0, size: random(160, 340), opacity: random(0.05, 0.1), phase: 0 };
    case "clear":
    default:
      return { x: 0, y: 0, vx: 0, vy: 0, size: 0, opacity: 0, phase: 0 };
  }
}

export function createParticles(field: Field, count: number): Particle[] {
  return Array.from({ length: count }, () => spawnParticle(field));
}

/**
 * Advances the simulation. `dt` is in seconds and is CLAMPED: a backgrounded
 * tab resumes with a delta of many seconds, and without the clamp every
 * particle would teleport off-screen and the effect would visibly restart.
 */
export function step(particles: Particle[], field: Field, dt: number): void {
  const delta = Math.min(0.05, Math.max(0, dt));
  const { width, height, effect } = field;

  for (const p of particles) {
    if (effect === "snow") {
      p.phase += delta * 1.4;
      p.x += (p.vx + Math.sin(p.phase) * 18) * delta;
    } else {
      p.x += p.vx * delta;
    }
    p.y += p.vy * delta;

    // Wrap rather than respawn where the motion is horizontal (cloud/fog
    // banks), so the field stays continuous instead of popping.
    if (effect === "clouds" || effect === "fog") {
      if (p.x + p.size < 0) p.x = width + p.size;
      if (p.x - p.size > width) p.x = -p.size;
      continue;
    }

    if (p.y > height + p.size || p.x < -p.size * 2 || p.x > width + p.size * 2) {
      Object.assign(p, spawnParticle(field, true));
    }
  }
}

/**
 * Shifts every particle by a screen-space delta. Called when the map pans or
 * zooms, so the weather appears to be attached to the world underneath rather
 * than painted on the glass - which is what makes it read as weather over a
 * place instead of a screensaver.
 *
 * Rain and snow only. Cloud and fog banks are treated as high-altitude and
 * stay put, which is both cheaper and closer to how they actually look.
 */
export function shift(particles: Particle[], field: Field, dx: number, dy: number): void {
  if (field.effect === "clouds" || field.effect === "fog") return;
  // A very large jump (a fly-to across the world) would drag every particle
  // off screen at once; respawning is the better answer there.
  if (Math.abs(dx) > field.width || Math.abs(dy) > field.height) {
    for (const p of particles) Object.assign(p, spawnParticle(field));
    return;
  }
  for (const p of particles) {
    p.x += dx;
    p.y += dy;
  }
}
