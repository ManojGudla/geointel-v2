import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayStore } from "../../progress/playStore";
import { sfx } from "../../sfx";
import {
  FLYER_R,
  FLYER_X,
  GROUND_H,
  TOWER_W,
  WORLD_H,
  WORLD_W,
  DAILY_CHANCES,
  chancesLeft,
  createFly,
  flap,
  medalFor,
  revive,
  spendChance,
  step,
  type FlyState,
  type Medal,
} from "./flyEngine";
import "./FlyManoj.css";

const FACE_SRC = "/play/manoj-face.webp";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  text?: string;
}

const MEDAL_LABEL: Record<Medal, string> = {
  none: "",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

/** Mixes two hex colours. t = 0 gives a, 1 gives b. */
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t)).join(",")})`;
}

/** Day → sunset → night as the score climbs, so a long run looks different from a short one. */
function skyColours(score: number): [string, string, number] {
  const day: [string, string] = ["#5ec8f2", "#d9f3ff"];
  const dusk: [string, string] = ["#f0703c", "#ffd98a"];
  const night: [string, string] = ["#0b1430", "#3b2a7a"];
  if (score < 12) return [day[0], day[1], 0];
  if (score < 20) {
    const t = (score - 12) / 8;
    return [mix(day[0], dusk[0], t), mix(day[1], dusk[1], t), 0];
  }
  if (score < 32) {
    const t = (score - 20) / 12;
    return [mix(dusk[0], night[0], t), mix(dusk[1], night[1], t), t];
  }
  return [night[0], night[1], 1];
}

/** A cheap repeatable hash, so a tower's lit windows stay the same as it scrolls. */
function hash(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, 16 * s, 0, Math.PI * 2);
  ctx.arc(x + 18 * s, y - 8 * s, 20 * s, 0, Math.PI * 2);
  ctx.arc(x + 40 * s, y, 15 * s, 0, Math.PI * 2);
  ctx.rect(x, y, 40 * s, 14 * s);
  ctx.fill();
}

/** Far skyline with an original, simplified Charminar-style landmark. */
function drawSkyline(ctx: CanvasRenderingContext2D, offset: number, night: number) {
  const base = WORLD_H - GROUND_H;
  const span = 520;
  ctx.fillStyle = night > 0.5 ? "rgba(40,30,90,0.75)" : mix("#7aa7c7", "#3a2f6a", night).replace("rgb", "rgba").replace(")", ",0.55)");
  for (let k = -1; k < 3; k++) {
    const ox = k * span - (offset % span);
    const blocks = [
      [0, 70], [34, 110], [70, 84], [100, 140], [138, 96], [176, 120], [214, 76], [250, 60],
      [400, 92], [436, 128], [474, 86],
    ];
    for (const [bx, h] of blocks) ctx.fillRect(ox + bx!, base - h!, 32, h!);
    // Landmark: four minarets around an arched block.
    const lx = ox + 300;
    ctx.fillRect(lx, base - 70, 84, 70);
    for (const mx of [0, 76]) {
      ctx.fillRect(lx + mx, base - 130, 8, 130);
      ctx.beginPath();
      ctx.arc(lx + mx + 4, base - 132, 6, Math.PI, 0);
      ctx.fill();
    }
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.moveTo(lx + 26, base);
    ctx.lineTo(lx + 26, base - 34);
    ctx.quadraticCurveTo(lx + 42, base - 56, lx + 58, base - 34);
    ctx.lineTo(lx + 58, base);
    ctx.fill();
    ctx.restore();
  }
}

function drawTower(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, flipped: boolean, seed: number, night: number) {
  const g = ctx.createLinearGradient(x, 0, x + TOWER_W, 0);
  g.addColorStop(0, "#4c3fd6");
  g.addColorStop(0.55, "#6d5bff");
  g.addColorStop(1, "#3a2fb0");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, TOWER_W, h);
  // Cap / ledge at the open end.
  const capY = flipped ? y + h - 14 : y;
  ctx.fillStyle = "#0d9488";
  ctx.fillRect(x - 5, capY, TOWER_W + 10, 14);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x - 5, capY + (flipped ? 11 : 0), TOWER_W + 10, 3);
  // Windows.
  const rows = Math.floor((h - 24) / 18);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 3; c++) {
      const lit = hash(seed * 31 + r * 7 + c) > (night > 0.4 ? 0.35 : 0.7);
      ctx.fillStyle = lit ? (night > 0.4 ? "#ffe9a3" : "rgba(220,240,255,0.85)") : "rgba(15,10,60,0.45)";
      const wy = flipped ? y + h - 30 - r * 18 : y + 22 + r * 18;
      ctx.fillRect(x + 9 + c * 17, wy, 11, 10);
    }
  }
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const bob = Math.sin(t * 5 + x * 0.05) * 3;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.shadowColor = "rgba(13,148,136,0.7)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#14b8a6";
  ctx.beginPath();
  ctx.arc(0, -6, 10, Math.PI, 0);
  ctx.quadraticCurveTo(10, 4, 0, 14);
  ctx.quadraticCurveTo(-10, 4, -10, -6);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, -6, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFlyer(ctx: CanvasRenderingContext2D, s: FlyState, face: HTMLImageElement | null) {
  // Just the head, cut out from the photo: no frame, no wings, no ring. It
  // tilts with the climb and the dive, which is all the motion it needs.
  const tilt = s.phase === "ready" ? Math.sin(s.time * 4) * 0.08 : Math.max(-0.45, Math.min(1.2, s.vy / 650));
  // After a second chance he blinks while the shield lasts.
  if (s.shield > 0 && Math.floor(s.time * 12) % 2 === 0) return;
  const size = FLYER_R * 2.9;
  ctx.save();
  ctx.translate(FLYER_X, s.y);
  ctx.rotate(tilt);
  if (face && face.complete && face.naturalWidth) {
    ctx.drawImage(face, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = "#6d5bff";
    ctx.beginPath();
    ctx.arc(0, 0, FLYER_R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Fly maNOWj: tap to keep the founder in the air and thread him between the
 * towers of the city.
 */
export function FlyManoj({ onBackToHub }: { onBackToHub: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<FlyState>(createFly());
  const particlesRef = useRef<Particle[]>([]);
  const shakeRef = useRef(0);
  const flapAtRef = useRef(-10);
  const faceRef = useRef<HTMLImageElement | null>(null);
  const deadAtRef = useRef<number | null>(null);
  const finalShownRef = useRef(false);
  const [phase, setPhase] = useState<FlyState["phase"]>("ready");
  const [final, setFinal] = useState<{ score: number; pins: number; best: number; newBest: boolean } | null>(null);
  const [chances, setChances] = useState(() => chancesLeft());
  const [revived, setRevived] = useState(0);
  /** A finished run waiting to be saved: saved when the player restarts or leaves, not when they take a second chance. */
  const pendingRef = useRef<{ score: number } | null>(null);
  const recordRound = usePlayStore((s) => s.recordRound);
  const statsFor = usePlayStore((s) => s.statsFor);
  const bestRef = useRef(statsFor("fly-manowj").bestScore);

  useEffect(() => {
    const img = new Image();
    img.src = FACE_SRC;
    faceRef.current = img;
  }, []);

  const burst = useCallback((x: number, y: number, colors: string[], n: number, speed = 160) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      particlesRef.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0, max: 0.5 + Math.random() * 0.4, color: colors[i % colors.length]!, size: 2 + Math.random() * 3 });
    }
  }, []);

  const press = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === "dead") return;
    stateRef.current = flap(s);
    flapAtRef.current = stateRef.current.time;
    if (s.phase === "ready") setPhase("playing");
    sfx("flap");
  }, []);

  const saveRun = useCallback(() => {
    const run = pendingRef.current;
    if (!run) return;
    pendingRef.current = null;
    recordRound({ gameId: "fly-manowj", score: run.score, outcome: "complete", flags: run.score >= 25 ? ["fly-manowj:25"] : run.score >= 10 ? ["fly-manowj:10"] : [] });
  }, [recordRound]);

  const secondChance = useCallback(() => {
    if (chancesLeft() <= 0 || stateRef.current.phase !== "dead") return;
    setChances(spendChance());
    stateRef.current = revive(stateRef.current);
    pendingRef.current = null;
    particlesRef.current = [];
    deadAtRef.current = null;
    finalShownRef.current = false;
    setFinal(null);
    setRevived((n) => n + 1);
    setPhase("ready");
    sfx("win");
  }, []);

  const leave = useCallback(() => {
    saveRun();
    onBackToHub();
  }, [saveRun, onBackToHub]);

  // Leaving mid-game still saves a finished run.
  useEffect(() => () => saveRun(), [saveRun]);

  const restart = useCallback(() => {
    saveRun();
    setRevived(0);
    stateRef.current = createFly();
    particlesRef.current = [];
    deadAtRef.current = null;
    finalShownRef.current = false;
    setFinal(null);
    setPhase("ready");
    sfx("select");
  }, [saveRun]);

  // Keyboard: Space, Up arrow or W to fly. After a crash: Enter or Space takes
  // the second chance if there is one (otherwise restarts), R restarts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        if (stateRef.current.phase === "dead") {
          if (final) (chances > 0 ? secondChance : restart)();
        } else press();
      } else if (e.code === "Enter" && final) {
        (chances > 0 ? secondChance : restart)();
      } else if (e.code === "KeyR" && final) {
        restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, restart, secondChance, final, chances]);

  // The loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const rng = { next: () => Math.random() };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const before = stateRef.current;
      const s = step(before, dt, rng);
      stateRef.current = s;

      for (const ev of s.events) {
        if (ev === "point") {
          sfx("point");
          particlesRef.current.push({ x: FLYER_X + 10, y: s.y - 30, vx: 0, vy: -50, life: 0, max: 0.7, color: "#ffffff", size: 16, text: "+1" });
        } else if (ev === "pin") {
          sfx("correct");
          burst(FLYER_X + 20, s.y, ["#14b8a6", "#5eead4", "#ffffff"], 14);
        } else if (ev === "crash" || ev === "ground") {
          sfx("crash");
          shakeRef.current = 0.35;
          burst(FLYER_X, s.y, ["#ffd54a", "#ffffff", "#6d5bff"], 22, 220);
          if (deadAtRef.current === null) deadAtRef.current = now;
        }
      }
      if (s.phase === "dead" && before.phase !== "dead") setPhase("dead");

      // Show the score card once he has landed.
      if (s.phase === "dead" && deadAtRef.current !== null && now - deadAtRef.current > 750 && !finalShownRef.current) {
        finalShownRef.current = true;
        sfx("drop");
        const newBest = s.score > bestRef.current;
        if (newBest) {
          bestRef.current = s.score;
          window.setTimeout(() => sfx("win"), 250);
        }
        pendingRef.current = { score: s.score };
        setFinal({ score: s.score, pins: s.pins, best: bestRef.current, newBest });
      }

      // ── draw ─────────────────────────────────────────────────────────────
      const W = canvas.width;
      const H = canvas.height;
      const scale = Math.min(W / WORLD_W, H / WORLD_H);
      const ox = (W - WORLD_W * scale) / 2;
      const oy = (H - WORLD_H * scale) / 2;
      const [skyTop, skyBottom, night] = skyColours(s.score);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, skyTop);
      bg.addColorStop(1, skyBottom);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      let sx = 0;
      let sy = 0;
      if (shakeRef.current > 0) {
        shakeRef.current = Math.max(0, shakeRef.current - dt);
        const k = shakeRef.current * 22 * scale;
        sx = (Math.random() - 0.5) * k;
        sy = (Math.random() - 0.5) * k;
      }
      ctx.setTransform(scale, 0, 0, scale, ox + sx, oy + sy);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-ox / scale, 0, W / scale, WORLD_H);
      ctx.clip();

      // Stars at night.
      if (night > 0.1) {
        for (let i = 0; i < 40; i++) {
          const x = (hash(i) * WORLD_W * 1.6 - (s.distance * 0.05) % (WORLD_W * 1.6) + WORLD_W * 1.6) % (WORLD_W * 1.6) - WORLD_W * 0.3;
          ctx.fillStyle = `rgba(255,255,255,${night * (0.4 + 0.6 * hash(i + 99)) * (0.7 + 0.3 * Math.sin(s.time * 3 + i))})`;
          ctx.fillRect(x, hash(i + 7) * WORLD_H * 0.55, 1.6, 1.6);
        }
      }
      // Clouds.
      for (let i = 0; i < 5; i++) {
        const span = WORLD_W + 160;
        const x = ((hash(i + 3) * span - s.distance * (0.12 + i * 0.03)) % span + span) % span - 100;
        drawCloud(ctx, x, 60 + hash(i + 11) * 220, 0.8 + hash(i) * 0.7, 0.75 - night * 0.55);
      }
      drawSkyline(ctx, s.distance * 0.3, night);

      for (const t of s.towers) {
        const top = t.gapY - t.gap / 2;
        const bottom = t.gapY + t.gap / 2;
        drawTower(ctx, t.x, -10, top + 10, true, Math.round(t.gapY), night);
        drawTower(ctx, t.x, bottom, WORLD_H - GROUND_H - bottom, false, Math.round(t.gapY) + 1, night);
        if (t.pin && !t.pin.taken) drawPin(ctx, t.x + TOWER_W / 2, t.pin.y, s.time);
      }

      // Ground.
      const gy = WORLD_H - GROUND_H;
      ctx.fillStyle = "#2f9e5b";
      ctx.fillRect(-ox / scale, gy, W / scale, 14);
      ctx.fillStyle = "#c9a46a";
      ctx.fillRect(-ox / scale, gy + 14, W / scale, GROUND_H);
      ctx.fillStyle = "#b58f55";
      for (let x = -((s.distance) % 28) - ox / scale; x < W / scale; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, gy + 14);
        ctx.lineTo(x + 14, gy + 14);
        ctx.lineTo(x + 2, gy + GROUND_H);
        ctx.lineTo(x - 12, gy + GROUND_H);
        ctx.fill();
      }
      ctx.fillStyle = "#3fbf72";
      ctx.fillRect(-ox / scale, gy, W / scale, 4);

      drawFlyer(ctx, s, faceRef.current);

      // Particles.
      particlesRef.current = particlesRef.current.filter((p) => p.life < p.max);
      for (const p of particlesRef.current) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.text ? 0 : 420) * dt;
        const a = Math.max(0, 1 - p.life / p.max);
        if (p.text) {
          ctx.font = "800 18px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.lineWidth = 4;
          ctx.strokeStyle = `rgba(30,20,90,${a})`;
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.fillText(p.text, p.x, p.y);
        } else {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, p.size, p.size);
          ctx.globalAlpha = 1;
        }
      }

      // Score.
      if (s.phase !== "ready") {
        ctx.font = "900 54px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.lineWidth = 8;
        ctx.strokeStyle = "rgba(25,15,80,0.85)";
        ctx.strokeText(String(s.score), WORLD_W / 2, 34);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(String(s.score), WORLD_W / 2, 34);
      }
      ctx.restore();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [burst]);

  const medal = final ? medalFor(final.score) : "none";

  return (
    <div className="game game--fly">
      <div
        ref={wrapRef}
        className="fly__stage"
        onPointerDown={(e) => {
          e.preventDefault();
          press();
        }}
      >
        <canvas ref={canvasRef} className="fly__canvas" role="img" aria-label="Fly maNOWj game. Tap, click or press Space to fly." />

        <div className="fly__chances" aria-label={`${chances} second chances left today`}>
          <span aria-hidden="true">♥</span> {chances}
        </div>

        {phase === "ready" && revived > 0 && (
          <div className="fly__intro" aria-hidden="true">
            <p className="fly__title">Second chance!</p>
            <p className="fly__hint">Tap to carry on from {stateRef.current.score}</p>
          </div>
        )}

        {phase === "ready" && revived === 0 && (
          <div className="fly__intro" aria-hidden="true">
            <p className="fly__title">
              Fly ma<b>NOW</b>j
            </p>
            <p className="fly__hint">Tap, click or press Space to fly</p>
            <p className="fly__sub">Fly through the gaps · grab the map pins for +1</p>
            {bestRef.current > 0 && <p className="fly__best">Best: {bestRef.current}</p>}
          </div>
        )}

        {final && (
          <div className="fly__over" role="dialog" aria-label="Game over" onPointerDown={(e) => e.stopPropagation()}>
            <p className="fly__over-title">{chances > 0 ? "Take a second chance?" : final.newBest ? "New best!" : "Game over"}</p>
            <div className="fly__card">
              <div className={`fly__medal fly__medal--${medal}`} aria-label={medal === "none" ? "No medal" : `${MEDAL_LABEL[medal]} medal`}>
                {medal === "none" ? "·" : MEDAL_LABEL[medal][0]}
              </div>
              <dl className="fly__stats">
                <div>
                  <dt>Score</dt>
                  <dd>{final.score}</dd>
                </div>
                <div>
                  <dt>Best</dt>
                  <dd>{final.best}</dd>
                </div>
                <div>
                  <dt>Pins</dt>
                  <dd>{final.pins}</dd>
                </div>
              </dl>
            </div>
            <p className="fly__next">
              {medal === "none"
                ? "Reach 10 for bronze."
                : medal === "bronze"
                  ? "20 for silver."
                  : medal === "silver"
                    ? "30 for gold."
                    : medal === "gold"
                      ? "50 for platinum."
                      : "Platinum. Unbeatable."}
            </p>
            {chances > 0 ? (
              <>
                <button type="button" className="fly__continue" onClick={secondChance} autoFocus>
                  <span>Continue from {final.score}</span>
                  <small>
                    Uses 1 chance · <span aria-hidden="true">♥</span> {chances} of {DAILY_CHANCES} left today
                  </small>
                </button>
                <div className="fly__actions">
                  <button type="button" className="play-btn play-btn--quiet" onClick={restart}>
                    Restart
                  </button>
                  <button type="button" className="play-btn play-btn--quiet" onClick={leave}>
                    All games
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="fly__next">No second chances left today. They refill tomorrow.</p>
                <div className="fly__actions">
                  <button type="button" className="play-btn play-btn--primary" onClick={restart} autoFocus>
                    Restart
                  </button>
                  <button type="button" className="play-btn play-btn--quiet" onClick={leave}>
                    All games
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
