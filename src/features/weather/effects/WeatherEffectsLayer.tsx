import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocationStore } from "@/stores/locationStore";
import { useMapStore } from "@/stores/mapStore";
import { useWeatherEffectStore } from "./weatherEffectStore";
import { createParticles, shift, step as stepParticles, type Field, type Particle } from "./particles";
import {
  downgrade,
  effectForWeatherCode,
  initialQuality,
  particleCount,
  shouldDowngrade,
  type Quality,
  type WeatherEffect,
} from "./weatherEffects";
import { apiGet } from "@/services/apiClient";
import "./WeatherEffectsLayer.css";

interface WeatherCurrentDto {
  weather: { weatherCode?: number; condition: string };
}

/**
 * Draws real weather over the map — rain, snow, fog, cloud, storm — using the
 * actual reported condition at the selected location.
 *
 * Three things this does NOT do, all deliberate:
 *
 *  1. It does not run unless the user turned it on. Default off, always.
 *  2. It does not invent weather. If the lookup fails there is no effect and
 *     the toggle says "Weather unavailable" — a decorative shower over a dry
 *     city would be fabricated data on a map people are meant to trust.
 *  3. It does not sit on top of the data. The canvas is between the basemap
 *     and every overlay in the stacking order, is pointer-events: none, and
 *     is capped at a low opacity, so GIS points, routes, analysis results and
 *     labels stay fully readable underneath it.
 */
export function WeatherEffectsLayer() {
  const enabled = useWeatherEffectStore((s) => s.enabled);
  const location = useLocationStore((s) => s.selectedLocation);
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const fieldRef = useRef<Field>({ width: 0, height: 0, effect: "clear" });
  const qualityRef = useRef<Quality>("medium");
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const frameAvgRef = useRef(16);
  // Last camera position, used to shift the particle field so the weather
  // travels with the ground rather than being painted on the screen.
  const cameraRef = useRef<{ center: [number, number]; zoom: number } | null>(null);

  const weather = useQuery({
    queryKey: ["weather-effect", location?.lat, location?.lon],
    queryFn: ({ signal }) =>
      apiGet<WeatherCurrentDto>("/api/weather", { lat: location!.lat, lon: location!.lon }, signal),
    // Only fetched when the effects are actually on — turning this feature off
    // must cost nothing, not even a request.
    enabled: enabled && !!location,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const effect: WeatherEffect | null =
    enabled && weather.data?.weather.weatherCode !== undefined
      ? effectForWeatherCode(weather.data.weather.weatherCode)
      : null;

  // Set up / tear down the animation whenever the effect changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // "clear" is a real answer meaning "nothing to draw" — not a failure.
    if (!effect || effect === "clear") {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      particlesRef.current = [];
      return;
    }

    // prefers-reduced-motion: no animation at all. A full-screen particle
    // field is exactly what that setting exists to prevent.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    qualityRef.current = initialQuality();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // Capped device-pixel-ratio: on a 3x phone screen a full-viewport
      // canvas at native resolution costs more than the effect is worth.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      fieldRef.current = { width: rect.width, height: rect.height, effect };
      particlesRef.current = createParticles(fieldRef.current, particleCount(effect, qualityRef.current));
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0.016;
      const frameMs = lastTimeRef.current ? time - lastTimeRef.current : 16;
      lastTimeRef.current = time;

      // Rolling average, then step the quality down if the map is struggling.
      // The map's own rendering matters more than the decoration on top of it.
      frameAvgRef.current = frameAvgRef.current * 0.9 + frameMs * 0.1;
      if (shouldDowngrade(frameAvgRef.current) && qualityRef.current !== "off") {
        qualityRef.current = downgrade(qualityRef.current);
        frameAvgRef.current = 16;
        particlesRef.current = createParticles(fieldRef.current, particleCount(effect, qualityRef.current));
      }

      const field = fieldRef.current;
      stepParticles(particlesRef.current, field, dt);

      ctx.clearRect(0, 0, field.width, field.height);
      paint(ctx, particlesRef.current, effect);

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastTimeRef.current = 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [effect]);

  // Follow the camera: convert the pan/zoom into a screen-space shift so the
  // weather stays over the same ground.
  useEffect(() => {
    const previous = cameraRef.current;
    cameraRef.current = { center, zoom };
    if (!previous || !particlesRef.current.length) return;

    const field = fieldRef.current;
    // Web-Mercator pixels-per-degree at this zoom, which is what the map's own
    // projection uses — so the shift matches how far the ground actually moved.
    const scale = (256 * Math.pow(2, zoom)) / 360;
    const dx = -(center[0] - previous.center[0]) * scale;
    const latitudeScale = Math.cos((center[1] * Math.PI) / 180);
    const dy = (center[1] - previous.center[1]) * scale * (latitudeScale === 0 ? 1 : 1 / latitudeScale);

    if (Math.abs(zoom - previous.zoom) > 0.01) {
      // A zoom changes the ground scale under every particle; respawning is
      // both cheaper and less strange-looking than trying to rescale them.
      particlesRef.current = createParticles(field, particlesRef.current.length);
      return;
    }
    shift(particlesRef.current, field, dx, dy);
  }, [center, zoom]);

  if (!enabled || !effect || effect === "clear") return null;

  return <canvas ref={canvasRef} className={`weather-fx weather-fx--${effect}`} aria-hidden="true" />;
}

/** Renders the current particle set. Kept out of the component for clarity. */
function paint(ctx: CanvasRenderingContext2D, particles: Particle[], effect: WeatherEffect) {
  if (effect === "rain" || effect === "storm") {
    ctx.lineCap = "round";
    ctx.strokeStyle = "#cfe3ff";
    ctx.lineWidth = effect === "storm" ? 1.6 : 1.2;
    for (const p of particles) {
      ctx.globalAlpha = p.opacity;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      // The streak follows the drop's own velocity, so wind-blown rain leans
      // the right way instead of always falling straight down.
      const length = p.size;
      const magnitude = Math.hypot(p.vx, p.vy) || 1;
      ctx.lineTo(p.x - (p.vx / magnitude) * length, p.y - (p.vy / magnitude) * length);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (effect === "snow") {
    ctx.fillStyle = "#ffffff";
    for (const p of particles) {
      ctx.globalAlpha = p.opacity;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Cloud and fog banks: soft radial blobs, very low opacity.
  for (const p of particles) {
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
    const tint = effect === "fog" ? "220, 226, 236" : "255, 255, 255";
    gradient.addColorStop(0, `rgba(${tint}, ${p.opacity})`);
    gradient.addColorStop(1, `rgba(${tint}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
}
