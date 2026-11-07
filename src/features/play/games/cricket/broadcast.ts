import type { Shot } from "./shots";
import { BATTING, FIELDING, STAND, UMPIRE, drawHuman, runPose, type Pose } from "./human";

/**
 * The broadcast-view renderer.
 *
 * Draws the match the way it looks on television: a camera high behind the
 * bowler, looking down the pitch at the batter, with the ground, the stands
 * and the floodlights around them. Everything is placed in real metres (the
 * pitch is 20.12 m, the stumps 71 cm) and projected through one camera, so
 * the ball's size, speed and bounce read correctly without any hand-tuned
 * screen positions.
 *
 * World coordinates match drs.ts: x is lateral (positive = OFF side for a
 * right-hander), y is height, z is distance from the batter's stumps toward
 * the bowler. The broadcast camera shows the off side on the LEFT of the
 * screen, so x is mirrored when projected.
 *
 * Pure drawing: no state, no clock, no React. The component passes in what
 * is happening and this paints one frame.
 */

export const PITCH_LENGTH = 20.12;
const FIELD_CENTRE_Z = PITCH_LENGTH / 2;
const BOUNDARY_R = 64;

export interface Cam {
  W: number;
  H: number;
  f: number;
  px: number;
  py: number;
  pz: number;
  r: [number, number, number];
  u: [number, number, number];
  fw: [number, number, number];
}

export function makeCamera(W: number, H: number): Cam {
  // A long lens from high behind the bowler, as on television: the batter
  // stands just above the middle of the picture, the ball is released low in
  // the frame and the bowler runs in from below the bottom edge. Phones held
  // upright get the same framing because the focal length follows height.
  const pos: [number, number, number] = [0, 6.5, 35];
  const target: [number, number, number] = [0, 1.15, 8];
  const fw = norm([target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]]);
  const r = norm(cross(fw, [0, 1, 0]));
  const u = cross(r, fw);
  const f = Math.min(H * 3.45, W * 3.9);
  return { W, H, f, px: pos[0], py: pos[1], pz: pos[2], r, u, fw };
}

function norm(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export interface Proj {
  x: number;
  y: number;
  /** Pixels per metre at this depth. */
  s: number;
  d: number;
}

/** World (metres) → screen (CSS pixels). Off side (x > 0) is drawn on the left. */
export function project(c: Cam, x: number, y: number, z: number): Proj | null {
  const vx = -x - c.px;
  const vy = y - c.py;
  const vz = z - c.pz;
  const d = vx * c.fw[0] + vy * c.fw[1] + vz * c.fw[2];
  if (d < 0.5) return null;
  const cx = vx * c.r[0] + vy * c.r[1] + vz * c.r[2];
  const cy = vx * c.u[0] + vy * c.u[1] + vz * c.u[2];
  const s = c.f / d;
  return { x: c.W / 2 + cx * s, y: c.H / 2 - cy * s, s, d };
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function quad(ctx: CanvasRenderingContext2D, c: Cam, pts: Array<[number, number, number]>, fill: string | CanvasGradient) {
  const ps = pts.map((p) => project(c, p[0], p[1], p[2]));
  if (ps.some((p) => !p)) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ps.forEach((p, i) => (i ? ctx.lineTo(p!.x, p!.y) : ctx.moveTo(p!.x, p!.y)));
  ctx.closePath();
  ctx.fill();
}

function line3(ctx: CanvasRenderingContext2D, c: Cam, a: [number, number, number], b: [number, number, number], color: string, width: number) {
  const pa = project(c, ...a);
  const pb = project(c, ...b);
  if (!pa || !pb) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, width * ((pa.s + pb.s) / 2));
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
}

/* ------------------------------------------------------------------ *
 * Stadium
 * ------------------------------------------------------------------ */

function drawStadium(ctx: CanvasRenderingContext2D, c: Cam, t: number, excite: number) {
  const { W, H } = c;
  const horizon = project(c, 0, 0, FIELD_CENTRE_Z - BOUNDARY_R - 6)?.y ?? H * 0.3;

  // A bright afternoon, like a day match on television.
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#7fbfe9");
  sky.addColorStop(1, "#cfe8f7");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon + 2);

  // Stands: a dark tiered bowl from the horizon up, with the crowd as dots.
  const top = Math.max(0, horizon - H * 0.3);
  const stand = ctx.createLinearGradient(0, top, 0, horizon);
  stand.addColorStop(0, "#3b4566");
  stand.addColorStop(1, "#59617f");
  ctx.fillStyle = stand;
  ctx.fillRect(0, top, W, horizon - top);
  // Tier lines.
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const y = top + ((horizon - top) * i) / 5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // Crowd.
  const palette = ["#f4b942", "#e84f6a", "#3fa7f5", "#ffffff", "#7b6cff", "#2ec4a6", "#ff8c3a"];
  const rows = 14;
  for (let r = 0; r < rows; r++) {
    const y = top + 6 + ((horizon - top - 12) * r) / rows;
    const step = 7 + r * 0.25;
    for (let x = (r % 2) * 3; x < W; x += step) {
      const k = hash(r * 997 + Math.floor(x));
      if (k < 0.25) continue;
      const bounce = excite > 0 ? Math.sin(t * 14 + k * 30) * excite * 2.2 : 0;
      ctx.fillStyle = palette[Math.floor(k * palette.length)]!;
      ctx.globalAlpha = 0.55 + 0.35 * k;
      ctx.fillRect(x, y + bounce, 2.2, 2.6);
    }
  }
  ctx.globalAlpha = 1;
  // Phone flashes when the crowd is up.
  if (excite > 0.2) {
    for (let i = 0; i < 30 * excite; i++) {
      const fx = hash(i * 7 + Math.floor(t * 9)) * W;
      const fy = top + hash(i * 13 + Math.floor(t * 9)) * (horizon - top);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(fx, fy, 2, 2);
    }
  }

  // Roof shade over the top tier.
  ctx.fillStyle = "rgba(20,24,44,0.55)";
  ctx.fillRect(0, top, W, Math.max(4, (horizon - top) * 0.12));
}

function drawField(ctx: CanvasRenderingContext2D, c: Cam) {
  const zBack = FIELD_CENTRE_Z - BOUNDARY_R;
  // Outfield with mowing stripes, far to near.
  for (let z = zBack - 2, i = 0; z < 46; z += 5, i++) {
    quad(
      ctx,
      c,
      [
        [-120, 0, z],
        [120, 0, z],
        [120, 0, z + 5],
        [-120, 0, z + 5],
      ],
      i % 2 ? "#5b9e3c" : "#67ad45"
    );
  }
  // Ad boards along the back boundary.
  const boards = ["maNOWj", "GEOINTEL", "PLAY", "maNOWj", "GEOINTEL", "PLAY", "maNOWj"];
  const bw = 16;
  for (let i = 0; i < 9; i++) {
    const x0 = -72 + i * bw;
    const z = zBack + Math.abs(x0 + bw / 2) * 0.18;
    const a = project(c, x0, 0.9, z);
    const b = project(c, x0 + bw, 0, z);
    if (!a || !b) continue;
    ctx.fillStyle = i % 2 ? "#1d1a6e" : "#0d6e66";
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.max(6, (b.y - a.y) * 0.62)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(boards[i % boards.length]!, (a.x + b.x) / 2, (a.y + b.y) / 2 + 0.5);
  }
  // Boundary rope and the 30-yard circle.
  for (const [radius, color, dash] of [
    [BOUNDARY_R - 1.5, "rgba(255,255,255,0.85)", false],
    [27.4, "rgba(255,255,255,0.45)", true],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.setLineDash(dash ? [6, 6] : []);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let k = 0; k <= 180; k++) {
      const a = (k / 180) * Math.PI * 2;
      const p = project(c, Math.sin(a) * radius, 0, FIELD_CENTRE_Z + Math.cos(a) * radius);
      if (!p || p.d < 2) {
        started = false;
        continue;
      }
      if (!started) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
      started = true;
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawPitch(ctx: CanvasRenderingContext2D, c: Cam) {
  const half = 1.52;
  const a = project(c, 0, 0, -1.8);
  const b = project(c, 0, 0, PITCH_LENGTH + 1.8);
  const g = a && b ? ctx.createLinearGradient(0, a.y, 0, b.y) : "#d9c38f";
  if (typeof g !== "string") {
    g.addColorStop(0, "#d4bc8a");
    g.addColorStop(0.5, "#e6d3a6");
    g.addColorStop(1, "#d8c190");
  }
  quad(
    ctx,
    c,
    [
      [-half, 0, -1.8],
      [half, 0, -1.8],
      [half, 0, PITCH_LENGTH + 1.8],
      [-half, 0, PITCH_LENGTH + 1.8],
    ],
    g
  );
  // Worn patches where the bowlers land and the batters stand.
  ctx.globalAlpha = 0.25;
  for (const [x, z, w, l] of [
    [0.1, 3.5, 0.9, 3.5],
    [-0.35, 1.2, 0.9, 1.6],
    [0.2, 18.5, 1.1, 2.4],
  ] as const) {
    quad(
      ctx,
      c,
      [
        [x - w / 2, 0.001, z - l / 2],
        [x + w / 2, 0.001, z - l / 2],
        [x + w / 2, 0.001, z + l / 2],
        [x - w / 2, 0.001, z + l / 2],
      ],
      "#a98f5c"
    );
  }
  ctx.globalAlpha = 1;
  // Creases at both ends.
  for (const [stumpZ, dir] of [
    [0, 1],
    [PITCH_LENGTH, -1],
  ] as const) {
    const popping = stumpZ + dir * 1.22;
    line3(ctx, c, [-1.83, 0.002, popping], [1.83, 0.002, popping], "rgba(255,255,255,0.92)", 0.05);
    line3(ctx, c, [-1.32, 0.002, stumpZ], [1.32, 0.002, stumpZ], "rgba(255,255,255,0.85)", 0.05);
    for (const x of [-1.32, 1.32]) line3(ctx, c, [x, 0.002, stumpZ - dir * 0.6], [x, 0.002, popping], "rgba(255,255,255,0.85)", 0.05);
  }
}

/* ------------------------------------------------------------------ *
 * Stumps and people
 * ------------------------------------------------------------------ */

function drawStumps(ctx: CanvasRenderingContext2D, c: Cam, z: number, brokenFor: number | null) {
  const xs = [-0.114, 0, 0.114];
  xs.forEach((x, i) => {
    const lean = brokenFor !== null ? Math.min(1, brokenFor * 4) * (i - 1 || 0.6) * 0.5 : 0;
    const base = project(c, x, 0, z);
    const topP = project(c, x + lean * 0.4, 0.711 - Math.abs(lean) * 0.2, z - Math.abs(lean) * 0.4);
    if (!base || !topP) return;
    ctx.strokeStyle = "#f6efe0";
    ctx.lineWidth = Math.max(1.5, base.s * 0.038);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(topP.x, topP.y);
    ctx.stroke();
    // Red sponsor band near the top.
    ctx.strokeStyle = "#d33";
    ctx.beginPath();
    ctx.moveTo(base.x + (topP.x - base.x) * 0.72, base.y + (topP.y - base.y) * 0.72);
    ctx.lineTo(base.x + (topP.x - base.x) * 0.8, base.y + (topP.y - base.y) * 0.8);
    ctx.stroke();
  });
  // Bails: on top, or flying.
  for (const side of [-1, 1]) {
    const flyT = brokenFor ?? 0;
    const bx = side * 0.057 + (brokenFor !== null ? side * flyT * 2.2 : 0);
    const by = 0.72 + (brokenFor !== null ? flyT * 3.2 - flyT * flyT * 6 : 0);
    const bz = z - (brokenFor !== null ? flyT * 2.5 : 0);
    if (by < 0) continue;
    const p = project(c, bx, by, bz);
    if (!p) continue;
    ctx.fillStyle = "#f6efe0";
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(brokenFor !== null ? flyT * 12 * side : 0);
    ctx.fillRect(-p.s * 0.055, -p.s * 0.012, p.s * 0.11, p.s * 0.024);
    ctx.restore();
  }
}

/** The batter in his stance, with the bat held in both hands. batAngle: degrees, 0 = toe straight down, + toward the leg side (screen right). */
function drawBatter(ctx: CanvasRenderingContext2D, p: Proj, batAngle: number, lean: number) {
  const s = p.s;
  const rad = (batAngle * Math.PI) / 180;
  // The hands travel round the body with the bat: low by the back pad in the
  // stance, high behind the shoulder at the top of the backlift, over the
  // front shoulder at the finish.
  const hands = { x: 0.04 + Math.sin(rad) * 0.33, y: -1.02 + Math.cos(rad) * 0.3 };
  const swingBody = Math.max(-1, Math.min(1, -Math.sin(rad) * (batAngle < 0 ? 1 : 0.4)));
  const pose: Pose = {
    lThigh: 0.35 + lean * 0.3,
    lKnee: 0.6,
    rThigh: 0.3,
    rKnee: 0.55,
    lSpread: 0.16 + lean * 0.1,
    rSpread: 0.14,
    lArm: 0,
    lElbow: 0,
    rArm: 0,
    rElbow: 0,
    lean: swingBody * 0.12 - lean * 0.1,
    crouch: 0.15,
    facing: 1,
  };
  drawHuman(ctx, p.x, p.y, s, BATTING, pose, { l: { x: hands.x - 0.03, y: hands.y + 0.02 }, r: { x: hands.x + 0.03, y: hands.y - 0.03 } });
  // The bat.
  const hx = p.x + hands.x * s;
  const hy = p.y + hands.y * s;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(-rad);
  ctx.strokeStyle = "rgba(20,20,30,0.5)";
  ctx.lineWidth = Math.max(0.6, s * 0.01);
  ctx.fillStyle = "#1d1d1d";
  ctx.fillRect(-s * 0.016, -s * 0.12, s * 0.032, s * 0.24);
  const blade = ctx.createLinearGradient(-s * 0.055, 0, s * 0.055, 0);
  blade.addColorStop(0, "#d6b06c");
  blade.addColorStop(0.6, "#f2dcab");
  blade.addColorStop(1, "#caa463");
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.roundRect(-s * 0.055, s * 0.11, s * 0.11, s * 0.56, s * 0.02);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#0d9488";
  ctx.fillRect(-s * 0.055, s * 0.2, s * 0.11, s * 0.05);
  ctx.restore();
  // Gloves over the handle.
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(20,20,30,0.45)";
  ctx.beginPath();
  ctx.arc(hx, hy, s * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// Thighs toward the camera and knees folded: a squat, seen from the front.
const KEEPER: Pose = { lThigh: 1.1, lKnee: 2.0, rThigh: 1.1, rKnee: 2.0, lSpread: 0.55, rSpread: 0.55, lArm: 0.12, lElbow: 0.05, rArm: -0.12, rElbow: -0.05, lean: 0, crouch: 0.6, facing: 1 };
const SLIP: Pose = { lThigh: 0.6, lKnee: 1.0, rThigh: 0.6, rKnee: 1.0, lSpread: 0.35, rSpread: 0.35, lArm: 0.3, lElbow: -0.5, rArm: -0.3, rElbow: 0.5, lean: 0, crouch: 0.3, facing: 1 };
const READY: Pose = { lThigh: 0.25, lKnee: 0.45, rThigh: 0.25, rKnee: 0.45, lSpread: 0.18, rSpread: 0.18, lArm: -0.25, lElbow: 0.7, rArm: 0.25, rElbow: -0.7, lean: 0, crouch: 0.15, facing: 1 };

function umpirePose(signal: SceneFrame["umpire"], t: number): Pose {
  const base: Pose = { ...STAND, facing: -1, lArm: -0.15, lElbow: 0.5, rArm: 0.15, rElbow: -0.5 };
  if (signal === "six") return { ...base, lArm: -Math.PI + 0.15, lElbow: 0, rArm: Math.PI - 0.15, rElbow: 0 };
  if (signal === "out") return { ...base, rArm: Math.PI - 0.05, rElbow: 0 };
  if (signal === "wide") return { ...base, lArm: -Math.PI / 2, lElbow: 0, rArm: Math.PI / 2, rElbow: 0 };
  if (signal === "four") return { ...base, rArm: Math.PI / 2 + Math.sin(t * 9) * 0.7, rElbow: 0 };
  return base;
}

/* ------------------------------------------------------------------ *
 * The frame
 * ------------------------------------------------------------------ */

export interface BallDraw {
  x: number;
  y: number;
  z: number;
}

export interface SceneFrame {
  t: number;
  /** 0..1 through the bowler's run-up; above 1 is the follow-through. */
  runup: number;
  ball: BallDraw | null;
  marker: { x: number; z: number; alpha: number } | null;
  batAngle: number;
  batLean: number;
  stumpsBrokenFor: number | null;
  umpire: "none" | "out" | "four" | "six" | "wide";
  excite: number;
}

const FIELDERS: Array<[number, number]> = [
  [21, 1.5],
  [17, 10],
  [-17, 9],
  [-21, -0.5],
  [22, -24],
  [-20, -26],
  [7, 28],
  [-8, 29],
];

export function drawBroadcast(ctx: CanvasRenderingContext2D, c: Cam, f: SceneFrame) {
  drawStadium(ctx, c, f.t, f.excite);
  drawField(ctx, c);
  drawPitch(ctx, c);

  // Fielders deeper than the batter first.
  for (const [x, z] of FIELDERS) {
    if (z > 18) continue;
    const p = project(c, x, 0, z);
    if (p) drawHuman(ctx, p.x, p.y, p.s, FIELDING, READY);
  }
  // Keeper and two slips, crouched behind the stumps.
  for (const [x, z, pose] of [
    [2.25, -3.2, SLIP],
    [1.25, -3.6, SLIP],
    [0.25, -2.2, KEEPER],
  ] as const) {
    const p = project(c, x, 0, z);
    if (p) drawHuman(ctx, p.x, p.y, p.s, { ...FIELDING, gloves: pose === KEEPER, pads: pose === KEEPER }, pose);
  }

  const ballBehindBatter = f.ball && f.ball.z < 0.45;
  if (f.ball && ballBehindBatter) drawBall(ctx, c, f.ball);
  drawStumps(ctx, c, 0, f.stumpsBrokenFor);

  // Pitch marker: where this ball will land.
  if (f.marker && f.marker.alpha > 0) {
    const m = f.marker;
    ctx.save();
    ctx.globalAlpha = m.alpha;
    const ring = 0.28 + Math.sin(f.t * 8) * 0.03;
    ctx.strokeStyle = "#ffe14d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k <= 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const p = project(c, m.x + Math.cos(a) * ring, 0.005, m.z + Math.sin(a) * ring);
      if (!p) continue;
      if (k) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(255,225,77,0.35)";
    ctx.fill();
    ctx.restore();
  }

  const bat = project(c, 0.32, 0, 0.95);
  if (bat) drawBatter(ctx, bat, f.batAngle, f.batLean);

  if (f.ball && !ballBehindBatter) drawBall(ctx, c, f.ball);

  // Bowler's end: stumps, non-striker, umpire, bowler (nearest last).
  drawStumps(ctx, c, PITCH_LENGTH, null);
  const ns = project(c, -2.1, 0, PITCH_LENGTH - 0.9);
  if (ns) drawHuman(ctx, ns.x, ns.y, ns.s, { ...BATTING, skin: "#9a6a45" }, { ...READY, facing: -1, lean: 0.05 });
  const ump = project(c, -0.95, 0, PITCH_LENGTH + 2.4);
  if (ump) drawHuman(ctx, ump.x, ump.y, ump.s, UMPIRE, umpirePose(f.umpire, f.t));

  // The bowler: runs in from behind the camera, delivers, follows through.
  const r = f.runup;
  if (r > 0 && r < 1.9) {
    const runZ = r <= 1 ? 33 - r * 12.4 : PITCH_LENGTH + 0.6 - (r - 1) * 2.4;
    const runX = r <= 1 ? 0.55 - r * 0.25 : 0.3 + (r - 1) * 0.9;
    const p = project(c, runX, 0, runZ);
    if (p) {
      const kit = { ...FIELDING, number: "11" };
      let pose: Pose;
      if (r <= 0.82) {
        pose = runPose(r * 30, -1, 0.7 + r * 0.4);
      } else if (r <= 1.05) {
        // Gather, leap and deliver: front arm high, bowling arm over the top.
        const k = Math.min(1, (r - 0.82) / 0.23);
        pose = {
          lThigh: -0.5,
          lKnee: 0.1,
          rThigh: 0.6,
          rKnee: 1.4,
          lSpread: 0.15,
          rSpread: 0.1,
          lArm: -Math.PI * 0.9 * (1 - k) - 0.3 * k,
          lElbow: 0.2,
          rArm: Math.PI * 0.25 + Math.PI * 1.1 * k,
          rElbow: 0,
          lean: -0.15 + 0.3 * k,
          crouch: 0,
          facing: -1,
        };
      } else {
        // Follow-through.
        const k = Math.min(1, (r - 1.05) / 0.5);
        pose = runPose(9 + k * 6, -1, 0.6 * (1 - k * 0.6));
        pose.lean = 0.25 * (1 - k);
      }
      drawHuman(ctx, p.x, p.y, p.s, kit, pose);
    }
  }
}

/** The small field radar in the corner: where the fielders are, seen from above. */
export function drawRadar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(40,90,40,0.55)";
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.43, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#e6d3a6";
  ctx.fillRect(x - r * 0.05, y - r * 0.16, r * 0.1, r * 0.32);
  const k = r / BOUNDARY_R;
  ctx.fillStyle = "#ffffff";
  for (const [fx, fz] of AERIAL_FIELDERS) {
    ctx.beginPath();
    ctx.arc(x - fx * k, y + (fz - FIELD_CENTRE_Z) * k, Math.max(1.6, r * 0.055), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, c: Cam, b: BallDraw) {
  const shadow = project(c, b.x, 0, b.z);
  const p = project(c, b.x, b.y, b.z);
  if (!p) return;
  if (shadow) {
    ctx.fillStyle = `rgba(0,0,0,${Math.max(0.12, 0.4 - b.y * 0.08)})`;
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, Math.max(1.6, shadow.s * 0.05), Math.max(0.8, shadow.s * 0.02), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const r = Math.max(2.2, p.s * 0.045);
  // A faint trail makes a fast ball readable at 60 frames a second.
  const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.2, p.x, p.y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#d7d9e0");
  ctx.fillStyle = g;
  ctx.shadowColor = "rgba(255,255,255,0.8)";
  ctx.shadowBlur = r * 1.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

/* ------------------------------------------------------------------ *
 * Aerial view: where the ball went
 * ------------------------------------------------------------------ */

export interface Flight {
  /** Degrees from straight; positive = off side. */
  angle: number;
  /** Fraction of the boundary along that line. Over 1 clears it. */
  distance: number;
  airborne: boolean;
  caught: boolean;
  runs: number;
  /** 0..1 through the animation. */
  p: number;
}

/** Where the boundary is along a line from the batter, in metres. */
function boundaryAlong(angleDeg: number): number {
  const a = (angleDeg * Math.PI) / 180;
  const dz = Math.cos(a);
  // Batter at z = 0, centre at FIELD_CENTRE_Z: solve |(0,0)+t(dx,dz) - (0,cz)| = R.
  const b = -2 * dz * FIELD_CENTRE_Z;
  const cc = FIELD_CENTRE_Z * FIELD_CENTRE_Z - BOUNDARY_R * BOUNDARY_R;
  return (-b + Math.sqrt(b * b - 4 * cc)) / 2;
}

const AERIAL_FIELDERS: Array<[number, number]> = [
  [22, 2],
  [24, 18],
  [10, 40],
  [-10, 42],
  [-25, 20],
  [-22, 1],
  [-24, -24],
  [26, -22],
  [0.3, -2],
];

export function drawAerial(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, fl: Flight, excite: number) {
  ctx.fillStyle = "#3b4566";
  ctx.fillRect(0, 0, W, H);
  // Sits a little high so the scoreboard strip at the bottom never hides the ball.
  const k = (Math.min(W, H * 0.92) * 0.4) / BOUNDARY_R;
  const cx = W / 2;
  const cy = H * 0.44;
  // World → screen: off side (x > 0) left, bowler's end down.
  const S = (x: number, z: number): [number, number] => [cx - x * k, cy + (z - FIELD_CENTRE_Z) * k];

  // Crowd ring.
  for (let i = 0; i < 360; i += 1.2) {
    const a = (i * Math.PI) / 180;
    for (let j = 0; j < 4; j++) {
      const rr = (BOUNDARY_R + 6 + j * 4) * k;
      const h = hash(i * 13 + j);
      if (h < 0.3) continue;
      ctx.fillStyle = ["#f4b942", "#e84f6a", "#3fa7f5", "#ffffff", "#7b6cff", "#2ec4a6"][Math.floor(h * 6)]!;
      const jump = excite * Math.sin(t * 16 + h * 40) * 1.5;
      ctx.fillRect(cx + Math.cos(a) * (rr + jump), cy + Math.sin(a) * (rr + jump), 2, 2);
    }
  }
  // Grass with stripes, clipped to the boundary.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, BOUNDARY_R * k, 0, Math.PI * 2);
  ctx.clip();
  for (let i = -14; i < 14; i++) {
    ctx.fillStyle = i % 2 ? "#5b9e3c" : "#67ad45";
    ctx.fillRect(0, cy + i * 5 * k, W, 5 * k + 1);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, BOUNDARY_R * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.arc(cx, cy, 27.4 * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // Pitch.
  const [p0x, p0y] = S(1.52, -1.5);
  const [p1x, p1y] = S(-1.52, PITCH_LENGTH + 1.5);
  ctx.fillStyle = "#d8c290";
  ctx.fillRect(p0x, p0y, p1x - p0x, p1y - p0y);

  // The ball's path.
  const total = boundaryAlong(fl.angle) * fl.distance;
  const a = (fl.angle * Math.PI) / 180;
  const ease = fl.airborne ? fl.p : 1 - Math.pow(1 - fl.p, 2.2);
  const dist = total * ease;
  const bx = Math.sin(a) * dist;
  const bz = Math.cos(a) * dist;

  // Fielders: the nearest one chases the ball; for a catch, one is waiting under it.
  const endX = Math.sin(a) * total;
  const endZ = Math.cos(a) * total;
  let chaser = 0;
  let best = Infinity;
  AERIAL_FIELDERS.forEach(([fx, fz], i) => {
    const d = Math.hypot(fx - endX, fz - endZ);
    if (d < best && i < AERIAL_FIELDERS.length - 1) {
      best = d;
      chaser = i;
    }
  });
  AERIAL_FIELDERS.forEach(([fx, fz], i) => {
    let x = fx;
    let z = fz;
    if (i === chaser && !(fl.caught && fl.distance <= 0.12)) {
      const towardX = fl.caught ? endX : endX * 0.92;
      const towardZ = fl.caught ? endZ : endZ * 0.92;
      const m = fl.caught ? Math.min(1, fl.p * 1.6) : Math.min(1, fl.p * 1.2);
      x = fx + (towardX - fx) * m;
      z = fz + (towardZ - fz) * m;
    }
    const [sx, sy] = S(x, z);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.arc(sx + 1.5, sy + 1.5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e0e4ee";
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#14306e";
    ctx.beginPath();
    ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Batters running between the wickets.
  if (fl.runs > 0 && fl.runs < 4 && !fl.caught) {
    const leg = Math.min(fl.runs, fl.p * fl.runs * 1.15);
    const along = leg % 2 < 1 ? leg % 1 : 1 - (leg % 1);
    for (const [start, off] of [
      [0, 0.8],
      [PITCH_LENGTH, -0.8],
    ] as const) {
      const z = start === 0 ? along * PITCH_LENGTH : PITCH_LENGTH - along * PITCH_LENGTH;
      const [sx, sy] = S(off, z);
      ctx.fillStyle = "#4c5fe0";
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    for (const [z, off] of [
      [0.6, 0.6],
      [PITCH_LENGTH + 0.6, -0.8],
    ] as const) {
      const [sx, sy] = S(off, z);
      ctx.fillStyle = "#4c5fe0";
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ball trail, shadow and the ball (bigger when it is high).
  const height = fl.airborne ? Math.sin(Math.min(1, fl.p) * Math.PI) * (fl.distance > 1 ? 1 : 0.7) : 0;
  const [tx, ty] = S(0, 0);
  const [gx, gy] = S(bx, bz);
  const trail = ctx.createLinearGradient(tx, ty, gx, gy);
  trail.addColorStop(0, "rgba(255,255,255,0)");
  trail.addColorStop(1, "rgba(255,255,255,0.75)");
  ctx.strokeStyle = trail;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(gx, gy - height * 26);
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.arc(gx, gy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(gx, gy - height * 26, 4 + height * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // A burst where a six lands in the crowd.
  if (fl.distance > 1 && fl.p > 0.92) {
    const q = (fl.p - 0.92) / 0.08;
    ctx.strokeStyle = `rgba(255,225,77,${1 - q})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(gx, gy, 8 + q * 30, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** The bat angle for the moment, from the shot and how far through the swing it is. */
export function batAngleFor(shot: Shot | null, swing: number | null, backlift: number): number {
  const stance = 18;
  const lifted = 150;
  if (swing === null) return stance + (lifted - stance) * backlift;
  const keys: number[] =
    shot === null
      ? [lifted, 60, 25]
      : shot.kind === "defend"
        ? [lifted, 8, 2]
        : shot.dir === "off"
          ? shot.kind === "loft"
            ? [lifted, 10, -120, -175]
            : [lifted, 20, -70, -140]
          : shot.dir === "leg"
            ? shot.kind === "loft"
              ? [lifted, 70, 120, 190]
              : [lifted, 55, 95, 150]
            : shot.kind === "loft"
              ? [lifted, 0, -150, -200]
              : [lifted, 0, -110, -165];
  const p = Math.max(0, Math.min(1, swing)) * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(p));
  const t = p - i;
  return keys[i]! + (keys[i + 1]! - keys[i]!) * t;
}
