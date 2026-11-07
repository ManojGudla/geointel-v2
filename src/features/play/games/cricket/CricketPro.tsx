import { useCallback, useEffect, useRef, useState } from "react";
import {
  AIMS,
  BALLS_PER_OVER,
  BOWLER_LABEL,
  CONTACT_LABEL,
  LENGTH_LABEL,
  REVIEWS_PER_INNINGS,
  applyBall,
  averageTimingError,
  chaseState,
  commentary,
  createMatch,
  createSuperOver,
  formatOvers,
  isOver,
  nextPlannedDelivery,
  outcomeOf,
  resultOf,
  type Delivery,
  type Difficulty,
  type MatchState,
} from "./timing";
import { PAD_Z, computeTrajectory, reviewLbw, settleReview, umpireDecision, wicketsVerdict, type Decision, type ReviewOutcome, type ReviewResult, type Trajectory } from "./drs";
import { DrsReview } from "./DrsReview";
import { aimForShot, applyWide, isWide, resolveShot, shotFromKey, shotFromSwipe, type Shot, type ShotDir, type ShotKind, type ShotResult } from "./shots";
import { PITCH_LENGTH, batAngleFor, drawAerial, drawBroadcast, drawRadar, makeCamera, type Flight, type SceneFrame } from "./broadcast";
import type { Rng } from "../../lib/random";
import { RoundSummary } from "../../components/RoundSummary";
import { usePlayStore } from "../../progress/playStore";
import type { AppliedRound } from "../../progress/applyRound";
import { sfx, startCrowdAmbience } from "../../sfx";
import "./CricketPro.css";

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };
const RUNUP_MS = 1500;
const RELEASE = { x: -0.25, y: 2.25, z: PITCH_LENGTH - 0.6 };

type Phase = "idle" | "runup" | "delivery" | "after" | "flight" | "result" | "done";

interface Live {
  phase: Phase;
  phaseAt: number;
  delivery: Delivery | null;
  traj: Trajectory | null;
  wide: boolean;
  releaseAt: number;
  contactAt: number;
  shot: Shot | null;
  shotAt: number | null;
  result: ShotResult | null;
  stumpsAt: number | null;
  bouncePlayed: boolean;
  steps: number;
  flight: Flight | null;
  excite: number;
  /** What happens if no shot is played - decided as the ball is bowled so the ball can be drawn going there. */
  noShot: ShotResult | null;
}

interface Shout {
  trajectory: Trajectory;
  playedShot: boolean;
  onField: Decision;
  state: MatchState;
}

interface PlayingReview {
  shout: Shout;
  result: ReviewResult;
  outcome: ReviewOutcome;
}

interface Splash {
  timing: string;
  big: string;
  tone: "six" | "four" | "out" | "runs" | "dot" | "wide";
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The speed-gun figure. The ball is deliberately slower on screen than in a
 * real match (no one can react to a true 145 km/h on a phone), so the gun
 * shows what that delivery represents: the bowler's type, scaled by how quick
 * this ball is relative to the others of its type.
 */
export function speedGun(d: Delivery): number {
  const [lo, hi] = d.bowler === "pace" ? [136, 152] : d.bowler === "medium" ? [118, 134] : [78, 96];
  const quickness = Math.max(0, Math.min(1, (2400 - d.travelMs) / 1600));
  return Math.round(lo + (hi - lo) * quickness);
}

/** Where the ball is, p = 0 at release and 1 at the pads. Past 1 it carries on to the stumps and the keeper. */
function ballAt(t: Trajectory, p: number, bowler: Delivery["bowler"], wide: boolean, after: "keeper" | "stumps" | "pad") {
  const pitchX = wide ? 1.05 : t.pitch.x;
  const total = RELEASE.z - PAD_Z;
  const f = Math.max(0.05, Math.min(0.97, (RELEASE.z - t.pitch.z) / total));
  if (p <= f) {
    const u = p / f;
    const loop = bowler === "spin" ? 1.25 : bowler === "medium" ? 0.45 : 0.25;
    const swing = bowler === "pace" ? t.deviation * 9 : 0;
    return {
      x: lerp(RELEASE.x, pitchX, u) + swing * u * (1 - u),
      y: lerp(RELEASE.y, 0.036, u) + loop * u * (1 - u),
      z: lerp(RELEASE.z, t.pitch.z, u),
    };
  }
  const impactX = wide ? pitchX + 0.1 : t.impact.x;
  const impactY = Math.max(0.05, t.impact.y);
  if (p <= 1) {
    const v = (p - f) / (1 - f);
    return { x: lerp(pitchX, impactX, v), y: lerp(0.036, impactY, v) + 0.12 * v * (1 - v), z: lerp(t.pitch.z, PAD_Z, v) };
  }
  // Past the bat: on to the stumps (bowled), dropping off the pad (LBW), or through to the keeper.
  const w = (p - 1) / 0.35;
  if (after === "pad") return { x: impactX + 0.15 * w, y: Math.max(0.036, impactY - 1.2 * w), z: PAD_Z + 0.6 * w };
  const towardStumps = after === "stumps";
  const endX = towardStumps ? 0 : wide ? impactX + 0.2 : t.stumps.x;
  const endY = towardStumps ? 0.35 : Math.max(0.2, t.stumps.y);
  const endZ = towardStumps ? 0 : -2.0;
  return { x: lerp(impactX, endX, Math.min(1, w)), y: lerp(impactY, endY, Math.min(1, w)), z: lerp(PAD_Z, endZ, Math.min(1, w)) };
}

/** After contact, the ball leaves the bat in the broadcast view before the camera cuts to the aerial view. */
function ballOffBat(r: ShotResult, t: Trajectory, k: number) {
  const a = ((r.landing?.angle ?? 0) * Math.PI) / 180;
  const speed = r.landing && r.landing.distance > 0.5 ? 34 : 12;
  const up = r.landing?.airborne ? 9 : 0.8;
  return {
    x: t.impact.x + Math.sin(a) * speed * k,
    y: Math.max(0.04, t.impact.y + up * k - 4.9 * k * k),
    z: PAD_Z + Math.cos(a) * speed * k,
  };
}

/**
 * Cricket, in the broadcast view.
 *
 * The bowler runs in from behind the camera, the pitch marker shows where the
 * ball will land, and you play the shot as it arrives: swipe (or arrow keys)
 * for direction, down to defend, LOFT for the big shot. Timing still decides
 * everything - measured against the wall clock, never against frames - and
 * the ball then flies into an aerial view of the ground so you see where it
 * went, who chased it and whether it cleared the rope.
 */
export function CricketPro({ onBackToHub }: { onBackToHub: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [state, setState] = useState<MatchState | null>(null);
  /** The direction picked on the pad (left thumb); the shot buttons (right thumb) play it. */
  const [dir, setDir] = useState<ShotDir>("straight");
  const [hudDelivery, setHudDelivery] = useState<Delivery | null>(null);
  const [splash, setSplash] = useState<Splash | null>(null);
  const [callOut, setCallOut] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [applied, setApplied] = useState<AppliedRound | null>(null);
  const [timingMeter, setTimingMeter] = useState<number | null>(null);
  const [reviewsLeft, setReviewsLeft] = useState(REVIEWS_PER_INNINGS);
  const [shout, setShout] = useState<Shout | null>(null);
  const [playing, setPlaying] = useState<PlayingReview | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [summaryReady, setSummaryReady] = useState(false);

  const recordRound = usePlayStore((s) => s.recordRound);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const rngRef = useRef<Rng | null>(null);
  const stateRef = useRef<MatchState | null>(null);
  const dirRef = useRef<ShotDir>("straight");
  dirRef.current = dir;
  const recordedRef = useRef(false);
  const ambienceStop = useRef<(() => void) | null>(null);
  const swipeRef = useRef<{ x: number; y: number; id: number; done: boolean } | null>(null);
  const autoNext = useRef<number | null>(null);
  const live = useRef<Live>({
    phase: "idle",
    phaseAt: 0,
    delivery: null,
    traj: null,
    wide: false,
    releaseAt: 0,
    contactAt: 0,
    shot: null,
    shotAt: null,
    result: null,
    stumpsAt: null,
    bouncePlayed: false,
    steps: 0,
    flight: null,
    excite: 0,
    noShot: null,
  });

  // Test hook, development builds only: lets an automated check play a
  // perfectly timed shot. Stripped from production by Vite.
  if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __cricketLive?: unknown }).__cricketLive = live;

  const goPhase = (p: Phase) => {
    live.current.phase = p;
    live.current.phaseAt = performance.now();
    setPhase(p);
  };

  const newMatch = useCallback((level: Difficulty) => {
    const m = createMatch(Date.now(), level);
    rngRef.current = m.rng;
    stateRef.current = m.state;
    recordedRef.current = false;
    setState(m.state);
    setApplied(null);
    setSplash(null);
    setCallOut("");
    setHudDelivery(null);
    setTimingMeter(null);
    setReviewsLeft(REVIEWS_PER_INNINGS);
    setShout(null);
    setPlaying(null);
    live.current = { ...live.current, phase: "idle", result: null, shot: null, shotAt: null, flight: null, stumpsAt: null, delivery: null, traj: null };
    setPhase("idle");
  }, []);

  useEffect(() => {
    newMatch(difficulty);
  }, [difficulty, newMatch]);

  useEffect(
    () => () => {
      ambienceStop.current?.();
      if (autoNext.current) window.clearTimeout(autoNext.current);
    },
    []
  );

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const bowl = useCallback(() => {
    const rng = rngRef.current;
    const current = stateRef.current;
    if (!rng || !current || isOver(current)) return;
    const L = live.current;
    if (L.phase === "runup" || L.phase === "delivery" || L.phase === "after" || L.phase === "flight") return;
    if (autoNext.current) window.clearTimeout(autoNext.current);
    if (!ambienceStop.current) ambienceStop.current = startCrowdAmbience();

    const { delivery } = nextPlannedDelivery(difficulty, current, rng);
    const lineAim = rng.pick(AIMS);
    const traj = computeTrajectory(delivery, lineAim, rng);
    const wide = isWide(delivery, rng);
    let noShot = resolveShot(null, delivery, null, traj.pitch.x, rng);
    if (noShot.outcome === "out") {
      const outright = wicketsVerdict(traj) === "hitting" && traj.impact.y < 0.25;
      noShot = outright ? { ...noShot, howOut: "bowled" } : { ...noShot, howOut: "lbw", detail: "No shot, struck on the pad. LBW" };
    }
    const now = performance.now();
    live.current = {
      ...L,
      delivery,
      traj,
      wide,
      releaseAt: now + RUNUP_MS,
      contactAt: now + RUNUP_MS + delivery.travelMs,
      shot: null,
      shotAt: null,
      result: null,
      stumpsAt: null,
      bouncePlayed: false,
      steps: 0,
      flight: null,
      excite: 0,
      noShot,
    };
    setHudDelivery(delivery);
    setSplash(null);
    setTimingMeter(null);
    setShout(null);
    goPhase("runup");
  }, [difficulty]);

  /** Applies a finished ball to the match and shows what happened. */
  const settle = useCallback((r: ShotResult) => {
    const rng = rngRef.current;
    const current = stateRef.current;
    const L = live.current;
    if (!rng || !current || !L.delivery) return;
    const next = applyBall(current, L.delivery, aimForShot(L.shot), r);
    stateRef.current = next;
    setState(next);
    setCallOut(commentary(current, next, r));

    // LBW shouts can be reviewed; a clean bowled cannot.
    if (r.outcome === "out" && r.howOut === "lbw" && L.traj) {
      const onField = umpireDecision(L.traj, L.shot !== null, rng);
      setShout({ trajectory: L.traj, playedShot: L.shot !== null, onField, state: current });
      setCallOut(onField === "out" ? "Big appeal for LBW... and the finger goes up. Review it?" : "Big appeal for LBW... not out says the umpire. You can still review.");
    }

    const tone: Splash["tone"] = r.outcome === "out" ? "out" : r.outcome === 6 ? "six" : r.outcome === 4 ? "four" : r.outcome === 0 ? "dot" : "runs";
    const big =
      r.outcome === "out"
        ? r.howOut === "lbw"
          ? "LBW!"
          : r.howOut === "caught" || r.howOut === "caught-behind"
            ? "CAUGHT!"
            : "BOWLED!"
        : r.outcome === 6
          ? "SIX!"
          : r.outcome === 4
            ? "FOUR!"
            : r.outcome === 0
              ? "DOT BALL"
              : `${r.outcome} RUN${r.outcome === 1 ? "" : "S"}`;
    const timing =
      r.shot === null
        ? "No shot"
        : r.contact === "perfect"
          ? "PERFECT TIMING"
          : r.contact === "great"
            ? "GREAT TIMING"
            : r.contact === "miss"
              ? "MISSED"
              : r.offsetMs < 0
                ? "EARLY"
                : "LATE";
    setSplash({ timing: `${timing}${r.shot ? ` · ${r.shotName}` : ""}`, big, tone });

    if (r.outcome === "out") sfx("crowd-groan");
    else if (r.outcome === 6) sfx("crowd-roar");
    else if (r.outcome === 4) sfx("crowd-cheer");

    const over = isOver(next);
    goPhase(over ? "done" : "result");
  }, []);

  const playShot = useCallback(
    (shot: Shot) => {
      const L = live.current;
      if (L.phase !== "delivery" || L.shotAt !== null || !L.delivery || !L.traj || !rngRef.current) return;
      const now = performance.now();
      L.shot = shot;
      L.shotAt = now;
      if (L.wide) return; // you can swing at a wide; it is still a wide.
      const offset = now - L.contactAt;
      let r = resolveShot(offset, L.delivery, shot, L.traj.pitch.x, rngRef.current);
      // Beaten and out: bowled if it would have hit low and straight, otherwise it hit the pad - an LBW shout.
      if (r.outcome === "out" && r.contact === "miss") {
        const outright = wicketsVerdict(L.traj) === "hitting" && L.traj.impact.y < 0.25;
        r = outright ? { ...r, howOut: "bowled", detail: "Beaten. Bowled" } : { ...r, howOut: "lbw", detail: "Struck on the pad. LBW" };
      }
      L.result = r;
      setTimingMeter(Math.max(-320, Math.min(320, offset)));
      if (shot.kind === "loft" && r.contact !== "miss") window.setTimeout(() => sfx("whoosh"), 60);
    },
    []
  );

  // Keyboard: arrows/WASD to play, Shift to loft, L toggles loft, Space bowls between balls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const L = live.current;
      if (L.phase === "delivery") {
        const shot = shotFromKey(e.code, e.shiftKey, false);
        if (shot) {
          e.preventDefault();
          playShot(shot);
        }
        return;
      }
      if ((e.code === "Space" || e.code === "Enter") && (L.phase === "idle" || L.phase === "result")) {
        e.preventDefault();
        bowl();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bowl, playShot]);

  // Swipes on the ground play the shot the moment the gesture is clear.
  const onPointerDown = (e: React.PointerEvent) => {
    const L = live.current;
    if (L.phase === "idle" || L.phase === "result") {
      bowl();
      return;
    }
    swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId, done: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const sw = swipeRef.current;
    if (!sw || sw.done || sw.id !== e.pointerId) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.hypot(dx, dy) > 22) {
      sw.done = true;
      playShot(shotFromSwipe(dx, dy, false));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const sw = swipeRef.current;
    if (!sw || sw.id !== e.pointerId) return;
    if (!sw.done) playShot({ dir: dirRef.current, kind: "ground" }); // a tap plays the picked direction
    swipeRef.current = null;
  };

  // Auto-bowl the next ball after a short pause, unless a review is pending.
  useEffect(() => {
    if (phase !== "result" || shout) return;
    autoNext.current = window.setTimeout(() => bowl(), 2600);
    return () => {
      if (autoNext.current) window.clearTimeout(autoNext.current);
    };
  }, [phase, shout, bowl]);

  // The canvas only exists while the match screen is showing (not before the
  // first state, not behind the scorecard), so the loop starts with it.
  const stageMounted = state !== null && !(phase === "done" && summaryReady && !shout && !playing);

  // The render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let W = 0;
    let H = 0;
    let dpr = 1;
    const resize = () => {
      const r = stage.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    const t0 = performance.now();

    const frame = (now: number) => {
      const L = live.current;
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      L.excite = Math.max(0, L.excite - 0.008);

      // ── advance the ball ──────────────────────────────────────────────
      let runup = 0;
      let ballPos: SceneFrame["ball"] = null;
      let marker: SceneFrame["marker"] = null;
      let backlift = 0;
      let swing: number | null = null;
      const d = L.delivery;
      const tr = L.traj;
      const showMarker = difficulty !== "hard";

      if (L.phase === "runup" && d && tr) {
        runup = Math.min(1, (now - L.phaseAt) / RUNUP_MS);
        const stepsDue = Math.floor(runup * 9);
        while (L.steps < stepsDue) {
          L.steps++;
          sfx("footstep");
        }
        if (showMarker && !L.wide) marker = { x: tr.pitch.x, z: tr.pitch.z, alpha: Math.min(1, runup * 2) };
        backlift = Math.max(0, (runup - 0.75) * 2);
        if (now >= L.releaseAt) goPhase("delivery");
      } else if (L.phase === "delivery" && d && tr) {
        runup = 1 + Math.min(0.9, (now - L.releaseAt) / 700);
        const p = (now - L.releaseAt) / d.travelMs;
        const fate = L.result ?? (L.shot === null ? L.noShot : null);
        const after = fate?.howOut === "bowled" ? "stumps" : fate?.howOut === "lbw" ? "pad" : "keeper";
        ballPos = ballAt(tr, Math.min(1.35, p), d.bowler, L.wide, after);
        if (!L.wide && showMarker) marker = { x: tr.pitch.x, z: tr.pitch.z, alpha: Math.max(0, 1 - p * 1.4) };
        else if (!L.wide && difficulty === "hard") marker = { x: tr.pitch.x, z: tr.pitch.z, alpha: Math.max(0, 0.9 - p * 1.6) };
        const pitchP = (RELEASE.z - tr.pitch.z) / (RELEASE.z - PAD_Z);
        if (!L.bouncePlayed && p >= pitchP) {
          L.bouncePlayed = true;
          sfx("bounce");
        }
        backlift = 1;
        if (L.shotAt !== null) swing = (now - L.shotAt) / 260;

        const r = L.result;
        if (r && r.contact !== "miss" && p >= 1) {
          // Bat meets ball: the sound, then the ball leaves the bat.
          sfx(r.contact === "perfect" || r.contact === "great" ? "bat-perfect" : r.contact === "edge" ? "bat-edge" : r.shot?.kind === "defend" ? "defend" : "bat-good");
          if (r.outcome === 6 || r.outcome === 4) L.excite = 1;
          goPhase("after");
        } else if (p >= 1.35 || (r?.howOut === "bowled" && p >= 1.33)) {
          // Past the bat.
          if (L.wide) {
            const next = applyWide(stateRef.current!);
            stateRef.current = next;
            setState(next);
            setSplash({ timing: "Too wide", big: "WIDE", tone: "wide" });
            setCallOut("Wide. A free run, and the ball is bowled again.");
            goPhase(isOver(next) ? "done" : "result");
          } else {
            const res = r ?? L.noShot!;
            L.result = res;
            if (res.howOut === "bowled") {
              L.stumpsAt = now;
              sfx("stumps");
            } else if (res.outcome === "out") {
              sfx("defend");
            } else sfx("crowd-ooh");
            settle(res);
          }
        }
      } else if (L.phase === "after" && d && tr && L.result) {
        const k = (now - L.phaseAt) / 1000;
        swing = 1 + k * 2;
        backlift = 1;
        runup = 1.9;
        ballPos = ballOffBat(L.result, tr, k);
        if (k > 0.42) {
          const r = L.result;
          if (r.landing && (r.landing.distance > 0.2 || r.outcome !== 0)) {
            L.flight = {
              angle: r.landing.angle,
              distance: r.landing.distance,
              airborne: r.landing.airborne,
              caught: r.outcome === "out",
              runs: typeof r.outcome === "number" ? r.outcome : 0,
              p: 0,
            };
            goPhase("flight");
          } else settle(r);
        }
      } else if (L.phase === "flight" && L.flight && L.result) {
        const dur = L.flight.distance > 1 ? 2100 : L.flight.caught ? 1800 : L.flight.runs >= 4 ? 1700 : 1200 + L.flight.runs * 380;
        L.flight.p = Math.min(1, (now - L.phaseAt) / dur);
        if (L.flight.p >= 1) {
          if (L.flight.caught) sfx("defend");
          settle(L.result);
        }
      } else if ((L.phase === "result" || L.phase === "done") && L.result) {
        swing = L.result.shot ? 1.4 : null;
        backlift = 0.2;
        runup = 0;
      }

      const r = L.result;
      if ((L.phase === "flight" || ((L.phase === "result" || L.phase === "done") && L.flight)) && L.flight) {
        drawAerial(ctx, W, H, t, L.flight, L.excite);
      } else {
        const cam = makeCamera(W, H);
        drawBroadcast(ctx, cam, {
          t,
          runup,
          ball: ballPos,
          marker,
          batAngle: batAngleFor(L.shot, swing, backlift),
          batLean: L.shot?.kind === "loft" && swing !== null ? Math.min(1, swing) : 0,
          stumpsBrokenFor: L.stumpsAt !== null ? (now - L.stumpsAt) / 1000 : null,
          umpire:
            (L.phase === "result" || L.phase === "done") && r
              ? r.outcome === 6
                ? "six"
                : r.outcome === 4
                  ? "four"
                  : r.outcome === "out" && r.howOut !== "lbw"
                    ? "out"
                    : "none"
              : L.phase === "result" && L.wide
                ? "wide"
                : "none",
          excite: L.excite,
        });
        const rr = Math.max(22, Math.min(36, W * 0.055));
        drawRadar(ctx, 12 + rr, 12 + rr, rr);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [difficulty, settle, stageMounted]);

  // Leaving the aerial view: the next ball starts on the broadcast camera.
  useEffect(() => {
    if (phase === "runup") live.current.flight = null;
  }, [phase]);

  /* ── DRS ─────────────────────────────────────────────────────────────── */
  const review = () => {
    if (!shout) return;
    const result = reviewLbw(shout.trajectory, shout.playedShot);
    setPlaying({ shout, result, outcome: settleReview(shout.onField, result) });
  };
  const rewindToNotOut = (base: MatchState, line: string) => {
    const current = stateRef.current;
    const played = current ? current.history[current.history.length - 1] : undefined;
    const rewound: MatchState = {
      ...base,
      ballsBowled: base.ballsBowled + 1,
      history: played ? [...base.history, { ...played, outcome: 0 }] : base.history,
    };
    stateRef.current = rewound;
    setState(rewound);
    setCallOut(line);
    setSplash({ timing: "Decision overturned", big: "NOT OUT", tone: "dot" });
    goPhase(isOver(rewound) ? "done" : "result");
  };
  const applyReview = () => {
    if (!playing) return;
    const p = playing;
    setPlaying(null);
    setShout(null);
    if (!p.outcome.reviewRetained) setReviewsLeft((n) => Math.max(0, n - 1));
    if (p.outcome.finalDecision === "not-out") rewindToNotOut(p.shout.state, "Not out! The review saves you.");
    else setCallOut(`${p.outcome.headline}. ${p.result.reason}`);
  };
  const declineReview = () => {
    if (shout && shout.onField === "not-out") rewindToNotOut(shout.state, "Given not out. The appeal is turned down.");
    setShout(null);
  };

  // Let the last ball's splash and aerial view play out before the scorecard replaces them.
  useEffect(() => {
    if (phase !== "done") {
      setSummaryReady(false);
      return;
    }
    const id = window.setTimeout(() => setSummaryReady(true), 2400);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Record the innings once.
  useEffect(() => {
    if (phase !== "done" || !state || recordedRef.current) return;
    recordedRef.current = true;
    const won = resultOf(state) === "won";
    window.setTimeout(() => sfx(won ? "win" : "lose"), 600);
    ambienceStop.current?.();
    ambienceStop.current = null;
    setApplied(
      recordRound({
        gameId: "cricket",
        score: state.runs,
        outcome: won ? "win" : "loss",
        flags: won && difficulty === "hard" ? ["cricket:beat-hard"] : [],
      })
    );
  }, [phase, state, difficulty, recordRound]);

  const toggleFullscreen = () => {
    const node = shellRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void node.requestFullscreen?.().catch(() => undefined);
  };

  if (!state) return null;
  const chase = chaseState(state);
  if (phase === "done" && summaryReady && !shout && !playing) {
    const outcome = outcomeOf(state);
    const won = outcome === "won";
    const tied = outcome === "tied";
    const avgError = averageTimingError(state.history);
    return (
      <div className="game">
        <RoundSummary
          gameTitle={state.superOver ? "Cricket: Super Over" : "Cricket"}
          headline={won ? `Chased it down: ${state.runs}/${state.wickets}` : tied ? `TIED: ${state.runs}/${state.wickets}` : `${state.runs}/${state.wickets}, ${chase.runsNeeded} short`}
          detail={
            tied
              ? `Level on ${state.runs}. It goes to a Super Over.`
              : avgError === null
                ? `Target was ${state.target}.`
                : `Target was ${state.target}. Your average timing was ${avgError}ms off the middle.`
          }
          score={state.runs}
          scoreLabel="Runs"
          won={won || tied}
          applied={applied}
          extraAction={
            tied
              ? {
                  label: "Play the Super Over",
                  onClick: () => {
                    const rng = rngRef.current;
                    if (!rng) return;
                    const next = createSuperOver(state, rng);
                    stateRef.current = next;
                    setState(next);
                    recordedRef.current = false;
                    setCallOut("Six balls. One wicket. Whatever it takes.");
                    setSplash(null);
                    goPhase("idle");
                  },
                }
              : undefined
          }
          lines={state.history.map(
            (h) => `${formatOvers(h.ball - 1)} ${LENGTH_LABEL[h.length]} → ${h.outcome === "out" ? "OUT" : h.outcome} · ${CONTACT_LABEL[h.contact]}${h.contact === "miss" ? "" : ` (${h.offsetMs > 0 ? "+" : ""}${Math.round(h.offsetMs)}ms)`}`
          )}
          onPlayAgain={() => newMatch(difficulty)}
          onBackToHub={onBackToHub}
        />
      </div>
    );
  }

  const overStart = Math.floor(Math.max(0, state.ballsBowled - (state.ballsBowled % BALLS_PER_OVER === 0 && state.ballsBowled > 0 && phase === "result" ? 1 : 0)) / BALLS_PER_OVER) * BALLS_PER_OVER;
  const thisOver = state.history.slice(overStart, overStart + BALLS_PER_OVER);

  return (
    <div className={`game game--cricketpro${fullscreen ? " is-fs" : ""}`} ref={shellRef}>
      {state.ballsBowled === 0 && phase === "idle" && (
        <div className="cp-setup">
          <div className="play-segmented play-segmented--small" role="group" aria-label="Difficulty">
            {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
              <button key={d} type="button" className={difficulty === d ? "active" : ""} onClick={() => setDifficulty(d)}>
                {DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
          <p className="cp-setup__note">
            {difficulty === "easy" ? "Slower bowling, bigger timing window, pitch marker shown." : difficulty === "normal" ? "Real pace, pitch marker shown." : "Express pace, the marker only flashes at release."}
          </p>
        </div>
      )}

      <div
        className="cp-stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipeRef.current = null)}
      >
        <canvas ref={canvasRef} className="cp-canvas" role="img" aria-label="Cricket match, broadcast view" />

        {/* TV graphics */}
        <div className="cp-tv" aria-live="polite">
          <div className="cp-tv__bat">
            <span className="cp-tv__team">YOU</span>
            <strong>
              {state.runs}/{state.wickets}
            </strong>
            <span className="cp-tv__ov">{formatOvers(state.ballsBowled)}</span>
          </div>
          <div className="cp-tv__chase">
            {state.runs >= state.target ? (
              "Target reached"
            ) : (
              <>
                Need <b>{chase.runsNeeded}</b> off <b>{chase.ballsLeft}</b>
              </>
            )}
          </div>
          <div className="cp-tv__over" aria-label="This over">
            {Array.from({ length: BALLS_PER_OVER }, (_, i) => {
              const b = thisOver[i];
              return (
                <span key={i} className={`cp-ball${b ? ` cp-ball--${b.outcome === "out" ? "w" : b.outcome}` : ""}`}>
                  {b ? (b.outcome === "out" ? "W" : b.outcome) : ""}
                </span>
              );
            })}
          </div>
        </div>

        {hudDelivery && (phase === "runup" || phase === "delivery") && (
          <div className="cp-bowler">
            <span>{BOWLER_LABEL[hudDelivery.bowler]}</span>
            {phase === "delivery" && <strong>{speedGun(hudDelivery)} km/h</strong>}
          </div>
        )}

        <button
          type="button"
          className="cp-fs"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
        >
          {fullscreen ? "⤡" : "⤢"}
        </button>

        {splash && (phase === "result" || phase === "done") && (
          <div className={`cp-splash cp-splash--${splash.tone}`} role="status">
            <span className="cp-splash__big">{splash.big}</span>
            <span className="cp-splash__timing">{splash.timing}</span>
          </div>
        )}

        {timingMeter !== null && difficulty !== "hard" && (phase === "result" || phase === "flight" || phase === "after") && (
          <div className="cp-meter" aria-label={`${Math.abs(Math.round(timingMeter))} milliseconds ${timingMeter < 0 ? "early" : "late"}`}>
            <span className="cp-meter__bar">
              <span className="cp-meter__seg cp-meter__seg--early" />
              <span className="cp-meter__seg cp-meter__seg--good" />
              <span className="cp-meter__seg cp-meter__seg--perfect" />
              <span className="cp-meter__seg cp-meter__seg--good" />
              <span className="cp-meter__seg cp-meter__seg--late" />
              <span className="cp-meter__tick" style={{ left: `${50 + (timingMeter / 320) * 50}%` }} />
            </span>
            <span className="cp-meter__labels">
              <span>EARLY</span>
              <span>PERFECT</span>
              <span>LATE</span>
            </span>
          </div>
        )}

        {phase === "idle" && (
          <div className="cp-prompt">
            <p className="cp-prompt__title">{state.ballsBowled === 0 ? `Chase ${state.target} off ${state.totalBalls / BALLS_PER_OVER} overs` : "Ready"}</p>
            <p className="cp-prompt__sub">Tap the ground or press Space to face the bowler</p>
          </div>
        )}

        {shout && !playing && (
          <div className="cp-drs" role="alert" onPointerDown={(e) => e.stopPropagation()}>
            <p className="cp-drs__head">{shout.onField === "out" ? "Given OUT, LBW" : "Appeal turned down"}</p>
            <p className="cp-drs__note">
              {reviewsLeft} review{reviewsLeft === 1 ? "" : "s"} left
            </p>
            <div className="cp-drs__actions">
              <button type="button" className="cp-drs__go" onClick={review} disabled={reviewsLeft <= 0}>
                {reviewsLeft > 0 ? "Review (DRS)" : "No reviews left"}
              </button>
              <button type="button" className="cp-drs__no" onClick={declineReview}>
                Accept
              </button>
            </div>
          </div>
        )}
      </div>

      {playing && (
        <DrsReview trajectory={playing.shout.trajectory} result={playing.result} outcome={playing.outcome} onFieldDecision={playing.shout.onField} onComplete={applyReview} />
      )}

      {callOut && <p className="cp-commentary">{callOut}</p>}

      <div className="cp-controls">
        <div className="cp-pad" role="radiogroup" aria-label="Direction">
          {(
            [
              ["off", "◀", "Off side"],
              ["straight", "▲", "Straight"],
              ["leg", "▶", "Leg side"],
            ] as Array<[ShotDir, string, string]>
          ).map(([d, icon, label]) => (
            <button key={d} type="button" role="radio" aria-checked={dir === d} aria-label={label} className={dir === d ? "is-on" : ""} onPointerDown={() => setDir(d)}>
              <span aria-hidden="true">{icon}</span>
              <small>{label}</small>
            </button>
          ))}
        </div>
        <div className="cp-shots" role="group" aria-label="Play the shot">
          {(
            [
              ["defend", "DEFEND"],
              ["ground", "STROKE"],
              ["loft", "LOFT"],
            ] as Array<[ShotKind, string]>
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={`cp-shot cp-shot--${kind}`}
              onPointerDown={() => (live.current.phase === "delivery" ? playShot({ dir: kind === "defend" ? "straight" : dirRef.current, kind }) : bowl())}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="cp-help">
        <span className="cp-help--touch">Pick a direction with your left thumb, then hit DEFEND, STROKE or LOFT as the ball arrives. Or just swipe on the pitch.</span>
        <span className="cp-help--keys">Keys: ← ↑ → play a stroke that way, hold Shift to loft, ↓ defends. Space bowls the next ball.</span>
      </p>
    </div>
  );
}

