/**
 * Turning real weather data into a visual effect - and refusing to invent one
 * when there isn't any data.
 *
 * The condition comes from a WMO weather code (Open-Meteo's `weather_code`),
 * which is the actual observed/forecast condition at that point, not a guess
 * from the temperature or the time of day. If the weather request fails, the
 * effect is NOT drawn and the UI says "Weather unavailable" - there is no
 * fallback to a pleasant default, because a decorative rain shower over a
 * city that is dry would be fabricated data on a map people are meant to
 * trust.
 */

export type WeatherEffect = "clear" | "clouds" | "rain" | "snow" | "fog" | "storm";

/**
 * WMO 4677 weather codes, as used by Open-Meteo.
 * https://open-meteo.com/en/docs - the code table is documented there.
 */
export function effectForWeatherCode(code: number): WeatherEffect {
  if (code === 0) return "clear";
  if (code === 1 || code === 2 || code === 3) return "clouds";
  if (code === 45 || code === 48) return "fog";
  // 51-57 drizzle, 61-67 rain, 80-82 rain showers
  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  // 71-77 snow, 85-86 snow showers
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  // 95-99 thunderstorm
  if (code >= 95 && code <= 99) return "storm";
  // Anything unrecognised is treated as "no effect" rather than guessed at.
  return "clear";
}

export const EFFECT_LABEL: Record<WeatherEffect, string> = {
  clear: "Clear",
  clouds: "Cloudy",
  rain: "Rain",
  snow: "Snow",
  fog: "Fog",
  storm: "Thunderstorm",
};

export type Quality = "high" | "medium" | "low" | "off";

/**
 * Particle counts per effect and quality tier.
 *
 * These are drawn on ONE canvas, not as DOM nodes - a few thousand absolutely
 * positioned divs is what makes browser weather effects tank a map's frame
 * rate, and this has to coexist with a WebGL map that is already doing real
 * work.
 */
const PARTICLE_BUDGET: Record<Quality, number> = { high: 900, medium: 420, low: 180, off: 0 };

const EFFECT_DENSITY: Record<WeatherEffect, number> = {
  clear: 0,
  clouds: 0.12,
  rain: 1,
  snow: 0.5,
  fog: 0.1,
  storm: 1,
};

export function particleCount(effect: WeatherEffect, quality: Quality): number {
  return Math.round(PARTICLE_BUDGET[quality] * EFFECT_DENSITY[effect]);
}

/**
 * Picks a starting quality from what the device tells us about itself.
 * `deviceMemory` and `hardwareConcurrency` are both optional and both lie
 * sometimes, so this is a starting point that the frame-rate monitor below
 * is allowed to override.
 */
export function initialQuality(nav: { hardwareConcurrency?: number; deviceMemory?: number } = navigator): Quality {
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  if (cores <= 2 || memory <= 2) return "low";
  if (cores <= 4 || memory <= 4) return "medium";
  return "high";
}

export function downgrade(quality: Quality): Quality {
  if (quality === "high") return "medium";
  if (quality === "medium") return "low";
  return "off";
}

/**
 * Decides whether to step the quality down, from a rolling average frame
 * time. 22ms is roughly 45fps - below that the map starts to feel sticky
 * while panning, and a decorative effect is never worth that.
 */
export const SLOW_FRAME_MS = 22;
export function shouldDowngrade(averageFrameMs: number): boolean {
  return averageFrameMs > SLOW_FRAME_MS;
}
