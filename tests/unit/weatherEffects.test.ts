import { describe, expect, it } from "vitest";
import {
  SLOW_FRAME_MS,
  downgrade,
  effectForWeatherCode,
  initialQuality,
  particleCount,
  shouldDowngrade,
} from "@/features/weather/effects/weatherEffects";
import { createParticles, shift, spawnParticle, step } from "@/features/weather/effects/particles";
import { useWeatherEffectStore } from "@/features/weather/effects/weatherEffectStore";
import { describeSettingCommand, parseSettingCommand } from "@/features/ai/settingCommands";

describe("weather code to effect", () => {
  it("maps the documented WMO codes", () => {
    expect(effectForWeatherCode(0)).toBe("clear");
    expect(effectForWeatherCode(2)).toBe("clouds");
    expect(effectForWeatherCode(45)).toBe("fog");
    expect(effectForWeatherCode(48)).toBe("fog");
    expect(effectForWeatherCode(53)).toBe("rain"); // drizzle
    expect(effectForWeatherCode(63)).toBe("rain");
    expect(effectForWeatherCode(81)).toBe("rain"); // showers
    expect(effectForWeatherCode(73)).toBe("snow");
    expect(effectForWeatherCode(86)).toBe("snow"); // snow showers
    expect(effectForWeatherCode(95)).toBe("storm");
    expect(effectForWeatherCode(99)).toBe("storm");
  });

  it("treats an unknown code as nothing to draw rather than guessing", () => {
    expect(effectForWeatherCode(7)).toBe("clear");
    expect(effectForWeatherCode(-1)).toBe("clear");
    expect(effectForWeatherCode(1234)).toBe("clear");
  });
});

describe("adaptive quality", () => {
  it("draws no particles at all for clear weather", () => {
    for (const q of ["high", "medium", "low", "off"] as const) {
      expect(particleCount("clear", q)).toBe(0);
    }
  });

  it("draws nothing when quality is off", () => {
    for (const e of ["rain", "snow", "fog", "clouds", "storm"] as const) {
      expect(particleCount(e, "off")).toBe(0);
    }
  });

  it("uses fewer particles at lower quality", () => {
    expect(particleCount("rain", "high")).toBeGreaterThan(particleCount("rain", "medium"));
    expect(particleCount("rain", "medium")).toBeGreaterThan(particleCount("rain", "low"));
  });

  it("steps down and eventually off", () => {
    expect(downgrade("high")).toBe("medium");
    expect(downgrade("medium")).toBe("low");
    expect(downgrade("low")).toBe("off");
    expect(downgrade("off")).toBe("off");
  });

  it("picks a lower starting quality on weaker devices", () => {
    expect(initialQuality({ hardwareConcurrency: 2, deviceMemory: 2 })).toBe("low");
    expect(initialQuality({ hardwareConcurrency: 4, deviceMemory: 4 })).toBe("medium");
    expect(initialQuality({ hardwareConcurrency: 12, deviceMemory: 8 })).toBe("high");
  });

  it("downgrades only when frames are genuinely slow", () => {
    expect(shouldDowngrade(16)).toBe(false);
    expect(shouldDowngrade(SLOW_FRAME_MS)).toBe(false);
    expect(shouldDowngrade(SLOW_FRAME_MS + 1)).toBe(true);
  });
});

describe("particle simulation", () => {
  const field = { width: 800, height: 600, effect: "rain" as const };

  it("creates the requested number of particles inside the field", () => {
    const particles = createParticles(field, 50);
    expect(particles).toHaveLength(50);
    for (const p of particles) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(field.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(field.height);
    }
  });

  it("moves rain downward", () => {
    /**
     * Started at the TOP on purpose, not from spawnParticle().
     *
     * This test was intermittently failing for months of runs and it was the
     * test at fault, not the simulation. spawnParticle() places a drop at a
     * RANDOM height, so roughly one run in ten started it near the bottom of
     * the field; a single step then carried it past the floor and it correctly
     * respawned at the top, so `y` came out smaller than it started and the
     * assertion failed. The rain was falling exactly as it should.
     *
     * A drop placed at y=0 cannot reach the floor in one 0.1s step, so what is
     * measured here is only the thing the test is named for.
     */
    const p = { x: 400, y: 0, vx: 0, vy: 800, size: 12, opacity: 0.4, phase: 0 };
    const before = p.y;
    step([p], field, 0.1);
    expect(p.y).toBeGreaterThan(before);
    expect(p.y).toBeLessThan(field.height); // proves it did not wrap
  });

  /**
   * Built by hand rather than with spawnParticle, which places the drop at a
   * RANDOM height. An earlier version of this test spawned one and compared
   * two copies of it - but if the random position happened to be near the
   * bottom, one step pushed it off-screen and step() respawned it with fresh
   * random values, so the two copies diverged and the test failed at random.
   * Starting at the top with a known velocity keeps the particle in the field
   * and makes the assertion about the clamp, which is what it is testing.
   */
  const dropAtTop = () => ({ x: 400, y: 0, vx: 0, vy: 800, size: 12, opacity: 0.4, phase: 0 });

  it("clamps a huge delta so a backgrounded tab doesn't teleport everything", () => {
    const a = dropAtTop();
    const b = dropAtTop();
    step([a], field, 0.05); // a normal frame, already at the clamp ceiling
    step([b], field, 30); // 30 seconds - a tab that was hidden and came back
    // Both are clamped to the same maximum step, so the field doesn't jump.
    expect(b.y).toBeCloseTo(a.y, 5);
    // And it genuinely moved rather than being frozen.
    expect(b.y).toBeGreaterThan(0);
    // Well inside the field, so neither could have respawned.
    expect(b.y).toBeLessThan(field.height);
  });

  it("does not let a huge delta carry a drop past the bottom of the field", () => {
    // The failure this guards against: without the clamp, dt = 30 moves a
    // 800px/s drop 24,000px in one frame - every particle vanishes at once
    // and the whole effect visibly restarts.
    const p = dropAtTop();
    step([p], field, 30);
    expect(p.y).toBeLessThanOrEqual(field.height);
  });

  it("recycles particles that fall off the bottom instead of losing them", () => {
    const particles = createParticles(field, 20);
    for (let i = 0; i < 200; i++) step(particles, field, 0.05);
    expect(particles).toHaveLength(20);
    for (const p of particles) expect(p.y).toBeLessThanOrEqual(field.height + p.size);
  });

  it("wraps cloud banks horizontally rather than respawning them", () => {
    const cloudField = { ...field, effect: "clouds" as const };
    const p = spawnParticle(cloudField);
    p.x = -p.size - 1;
    step([p], cloudField, 0.016);
    expect(p.x).toBeGreaterThan(cloudField.width);
  });

  it("shifts rain with the camera so it stays over the ground", () => {
    const particles = createParticles(field, 10);
    const before = particles.map((p) => p.x);
    shift(particles, field, 25, 10);
    particles.forEach((p, i) => expect(p.x).toBeCloseTo(before[i]! + 25, 5));
  });

  it("leaves cloud and fog banks in place when the camera moves", () => {
    const fogField = { ...field, effect: "fog" as const };
    const particles = createParticles(fogField, 5);
    const before = particles.map((p) => p.x);
    shift(particles, fogField, 40, 0);
    particles.forEach((p, i) => expect(p.x).toBe(before[i]));
  });

  it("respawns rather than dragging everything off screen on a huge jump", () => {
    const particles = createParticles(field, 10);
    shift(particles, field, field.width * 5, 0);
    for (const p of particles) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(field.width);
    }
  });
});

describe("the effects toggle", () => {
  it("is off by default", () => {
    expect(useWeatherEffectStore.getState().enabled).toBe(false);
  });

  it("turns on and off explicitly", () => {
    useWeatherEffectStore.getState().setEnabled(true);
    expect(useWeatherEffectStore.getState().enabled).toBe(true);
    useWeatherEffectStore.getState().setEnabled(false);
    expect(useWeatherEffectStore.getState().enabled).toBe(false);
  });
});

describe("copilot settings commands", () => {
  it("turns weather effects off and on", () => {
    expect(parseSettingCommand("turn off weather effects")).toEqual({ setting: "weather-effects", value: false });
    expect(parseSettingCommand("Turn on weather effects")).toEqual({ setting: "weather-effects", value: true });
    expect(parseSettingCommand("hide the weather overlay")).toEqual({ setting: "weather-effects", value: false });
    expect(parseSettingCommand("disable weather animation")).toEqual({ setting: "weather-effects", value: false });
  });

  it("does not mistake a weather QUESTION for a command", () => {
    expect(parseSettingCommand("what's the weather here")).toBeNull();
    expect(parseSettingCommand("is it going to rain tomorrow")).toBeNull();
    expect(parseSettingCommand("show me the weather")).toBeNull();
  });

  it("handles 3D and basemap commands idempotently", () => {
    expect(parseSettingCommand("turn on 3d")).toEqual({ setting: "3d", value: true });
    expect(parseSettingCommand("switch to 2d")).toEqual({ setting: "3d", value: false });
    expect(parseSettingCommand("switch to satellite")).toEqual({ setting: "basemap", value: "satellite" });
    expect(parseSettingCommand("change the map style to dark")).toEqual({ setting: "basemap", value: "dark" });
  });

  it("returns null for anything it cannot read confidently", () => {
    expect(parseSettingCommand("")).toBeNull();
    expect(parseSettingCommand("how many hospitals within 5 km")).toBeNull();
    expect(parseSettingCommand("weather effects")).toBeNull(); // no on/off given
  });

  it("describes only what it actually did", () => {
    expect(describeSettingCommand({ setting: "weather-effects", value: false })).toBe("Weather effects are off.");
    expect(describeSettingCommand({ setting: "3d", value: true })).toContain("3D");
    expect(describeSettingCommand({ setting: "basemap", value: "terrain" })).toContain("terrain");
  });
});
