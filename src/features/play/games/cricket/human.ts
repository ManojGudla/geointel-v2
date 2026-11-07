/**
 * People, drawn so they read as people.
 *
 * The first figures were sticks and boxes: straight arms and legs with no
 * knees or elbows, a rectangle for a body. At broadcast size the eye reads
 * that as a robot. What makes a small figure look human is mostly anatomy and
 * motion: limbs that taper and bend at the joint, shoulders wider than the
 * waist, a neck, a head the right size, weight on bent knees, and a run where
 * the knees lift and the arms swing against the legs.
 *
 * So each figure is a small skeleton (hip, knees, ankles, shoulders, elbows,
 * hands, head) posed with joint angles, then skinned with tapered limbs,
 * clothing, shading and an outline. Everything is in metres and scaled by
 * the camera, so a fielder 60 m away and the bowler 10 m away are the same
 * drawing at different sizes.
 */

export interface Kit {
  shirt: string;
  shirtDark: string;
  trousers: string;
  trousersDark: string;
  trim: string;
  skin: string;
  hair: string;
  /** cap, helmet, umpire hat, or bare head */
  head: "cap" | "helmet" | "hat" | "none";
  capColour?: string;
  pads?: boolean;
  gloves?: boolean;
  number?: string;
}

export const FIELDING: Kit = {
  shirt: "#f3f5fa",
  shirtDark: "#c9cfdc",
  trousers: "#eef1f6",
  trousersDark: "#c3c9d6",
  trim: "#0d9488",
  skin: "#b98458",
  hair: "#1b130e",
  head: "cap",
  capColour: "#0d9488",
};

export const BATTING: Kit = {
  shirt: "#3d55d6",
  shirtDark: "#2638a3",
  trousers: "#3349c4",
  trousersDark: "#22338f",
  trim: "#f5c518",
  skin: "#a8724a",
  hair: "#120c08",
  head: "helmet",
  pads: true,
  gloves: true,
};

export const UMPIRE: Kit = {
  shirt: "#e8edf5",
  shirtDark: "#bcc4d3",
  trousers: "#262b3a",
  trousersDark: "#151925",
  trim: "#262b3a",
  skin: "#b07a52",
  hair: "#2a2a2a",
  head: "hat",
};

export interface Pose {
  /**
   * Leg angles in radians. thigh: how far the thigh swings toward the camera
   * (0 = straight down); knee: how much the shin folds back. Seen from the
   * front or back these mostly SHORTEN the leg and lift the foot, which is
   * what a stride looks like on a broadcast camera. Spread opens the legs
   * sideways (a keeper's squat, a batter's stance).
   */
  lThigh: number;
  lKnee: number;
  rThigh: number;
  rKnee: number;
  /** Arm angles in radians from straight down at the shoulder, and elbow bend. Positive swings toward screen right. */
  lArm: number;
  lElbow: number;
  rArm: number;
  rElbow: number;
  lSpread?: number;
  rSpread?: number;
  /** Body lean (radians, + = right) and crouch (0 standing, 1 deep). */
  lean: number;
  crouch: number;
  /** -1 seen from behind, 1 from the front: decides face vs number. */
  facing: 1 | -1;
}

export const STAND: Pose = { lThigh: -0.05, lKnee: 0.08, rThigh: 0.05, rKnee: 0.08, lArm: -0.12, lElbow: 0.2, rArm: 0.12, rElbow: -0.2, lean: 0, crouch: 0, facing: 1 };

/** A running stride. phase in radians. */
export function runPose(phase: number, facing: 1 | -1, intensity = 1): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const k = intensity;
  return {
    lThigh: s * 0.55 * k,
    lKnee: Math.max(0.1, (0.9 + c * 0.8) * k),
    rThigh: -s * 0.55 * k,
    rKnee: Math.max(0.1, (0.9 - c * 0.8) * k),
    lArm: -0.18 - Math.max(0, s) * 0.25 * k,
    lElbow: 0.9 + s * 0.8 * k,
    rArm: 0.18 + Math.max(0, -s) * 0.25 * k,
    rElbow: -0.9 + s * 0.8 * k,
    lean: 0.06 * k,
    crouch: 0.05,
    facing,
  };
}

interface Pt {
  x: number;
  y: number;
}

/** A tapered limb with rounded ends, outlined: drawn as the outline colour slightly larger, then the fill. */
function limb(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, w1: number, w2: number, fill: string, outline: string) {
  const shape = (grow: number) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 1;
    const ny = (dx / len) * 1;
    const r1 = w1 + grow;
    const r2 = w2 + grow;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * r1, a.y + ny * r1);
    ctx.lineTo(b.x + nx * r2, b.y + ny * r2);
    ctx.lineTo(b.x - nx * r2, b.y - ny * r2);
    ctx.lineTo(a.x - nx * r1, a.y - ny * r1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(a.x, a.y, r1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(b.x, b.y, r2, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.fillStyle = outline;
  shape(Math.max(0.5, ctx.lineWidth * 0.8));
  ctx.fillStyle = fill;
  shape(0);
}

/** Point at distance len from p, at angle ang from straight down (positive = toward screen right). */
function along(p: Pt, ang: number, len: number): Pt {
  return { x: p.x + Math.sin(ang) * len, y: p.y + Math.cos(ang) * len };
}

export interface Joints {
  hip: Pt;
  shoulderL: Pt;
  shoulderR: Pt;
  handL: Pt;
  handR: Pt;
  head: Pt;
  headR: number;
}

/**
 * Draws one person standing at (x, y) (the ground point between the feet),
 * at s pixels per metre. Returns the joint positions so callers can attach a
 * bat or a ball to the hands.
 */
/** Two-bone reach: the shoulder and elbow angles that put the hand on a target (elbow bent outward). */
function reach(sh: Pt, target: Pt, upper: number, fore: number, outward: 1 | -1): [number, number] {
  const dx = target.x - sh.x;
  const dy = target.y - sh.y;
  const d = Math.max(1e-3, Math.min((upper + fore) * 0.995, Math.hypot(dx, dy)));
  const base = Math.atan2(dx, dy);
  const alpha = Math.acos(Math.max(-1, Math.min(1, (upper * upper + d * d - fore * fore) / (2 * upper * d))));
  const inner = Math.acos(Math.max(-1, Math.min(1, (upper * upper + fore * fore - d * d) / (2 * upper * fore))));
  return [base + outward * alpha, -outward * (Math.PI - inner)];
}

export interface Reach {
  /** Hand targets in metres from the ground point: x right, y down (so negative is up). */
  l?: { x: number; y: number };
  r?: { x: number; y: number };
}

export function drawHuman(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, kit: Kit, pose: Pose, hands?: Reach): Joints {
  const m = (v: number) => v * s;
  const thigh = m(0.44);
  const shin = m(0.45);
  const upper = m(0.29);
  const fore = m(0.27);
  const torso = m(0.52);
  const outline = "rgba(20,20,30,0.45)";
  ctx.save();
  ctx.lineWidth = Math.max(0.6, s * 0.012);
  ctx.lineJoin = "round";

  // Shadow.
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y, m(0.32), m(0.07), 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs in the camera's view: forward/back swing foreshortens, spread opens sideways.
  const legGeom = (th: number, kn: number, spread: number, side: -1 | 1) => {
    const thighV = thigh * Math.cos(th);
    const shinV = shin * Math.cos(th - kn);
    const kneeDx = side * Math.sin(spread) * thigh;
    const ankleDx = kneeDx + side * Math.sin(spread * 0.6) * shin;
    return { thighV, shinV, kneeDx, ankleDx, lift: Math.max(0, -(Math.cos(th - kn)) * shin * 0.4) };
  };
  const lg = legGeom(pose.lThigh, pose.lKnee, pose.lSpread ?? 0.06, -1);
  const rg = legGeom(pose.rThigh, pose.rKnee, pose.rSpread ?? 0.06, 1);
  const standH = Math.max(lg.thighV + lg.shinV, rg.thighV + rg.shinV);
  const hipY = y - standH - m(0.07);
  const hip: Pt = { x: x + Math.sin(pose.lean) * m(0.1), y: hipY };
  const hipL: Pt = { x: hip.x - m(0.085), y: hip.y };
  const hipR: Pt = { x: hip.x + m(0.085), y: hip.y };

  const legs: Array<[Pt, typeof lg, number]> = [
    [hipL, lg, pose.lThigh],
    [hipR, rg, pose.rThigh],
  ];
  for (const [h, g, th] of legs) {
    const knee: Pt = { x: h.x + g.kneeDx, y: h.y + g.thighV };
    const ankle: Pt = { x: h.x + g.ankleDx, y: knee.y + g.shinV };
    // A leg swung toward the camera is nearer, so a touch wider.
    const near = 1 + Math.max(0, Math.sin(th)) * 0.15 * (pose.facing === 1 ? 1 : -1);
    limb(ctx, h, knee, m(0.085) * near, m(0.066) * near, kit.trousers, outline);
    if (kit.pads) {
      limb(ctx, { x: knee.x, y: knee.y - m(0.05) }, ankle, m(0.078), m(0.07), "#fbfbf6", "rgba(0,0,0,0.3)");
      ctx.strokeStyle = "rgba(0,0,0,0.16)";
      for (const k of [-0.03, 0.03]) {
        ctx.beginPath();
        ctx.moveTo(knee.x + m(k), knee.y);
        ctx.lineTo(ankle.x + m(k), ankle.y - m(0.04));
        ctx.stroke();
      }
    } else {
      limb(ctx, knee, ankle, m(0.062), m(0.046), kit.trousersDark, outline);
    }
    // Shoe: the sole shows when the foot is lifted behind.
    ctx.fillStyle = g.shinV < shin * 0.6 && pose.facing === -1 ? "#d9d9d9" : "#f6f6f6";
    ctx.strokeStyle = outline;
    ctx.beginPath();
    ctx.ellipse(ankle.x, ankle.y + m(0.03), m(0.075), m(0.045), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Seat of the trousers joins the legs to the shirt.
  ctx.fillStyle = kit.trousers;
  ctx.beginPath();
  ctx.ellipse(hip.x, hip.y + m(0.03), m(0.17), m(0.1), 0, 0, Math.PI * 2);
  ctx.fill();

  // Torso: shoulders wider than the waist, leaning with the body.
  const neck = along(hip, Math.PI + pose.lean, torso);
  const shoulderW = m(0.21);
  const waistW = m(0.15);
  const shoulderL: Pt = { x: neck.x - shoulderW, y: neck.y + m(0.06) };
  const shoulderR: Pt = { x: neck.x + shoulderW, y: neck.y + m(0.06) };
  const grad = ctx.createLinearGradient(hip.x - shoulderW, 0, hip.x + shoulderW, 0);
  grad.addColorStop(0, kit.shirt);
  grad.addColorStop(1, kit.shirtDark);

  const drawArm = (sh: Pt, angIn: number, bendIn: number) => {
    let ang = angIn;
    let elbowBend = bendIn;
    const target = sh === shoulderL ? hands?.l : hands?.r;
    if (target) [ang, elbowBend] = reach(sh, { x: x + target.x * s, y: y + target.y * s }, upper, fore, sh === shoulderL ? -1 : 1);
    const elbow = along(sh, ang, upper);
    const hand = along(elbow, ang + elbowBend, fore);
    limb(ctx, sh, elbow, m(0.06), m(0.05), kit.shirt, outline);
    limb(ctx, elbow, hand, m(0.045), m(0.038), kit.gloves ? kit.shirt : kit.skin, outline);
    ctx.fillStyle = kit.gloves ? "#ffffff" : kit.skin;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, m(kit.gloves ? 0.055 : 0.042), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return hand;
  };

  // The arm on the far side goes behind the body.
  let handL: Pt;
  let handR: Pt;
  if (pose.facing === 1) {
    handR = drawArm(shoulderR, pose.rArm, pose.rElbow);
  } else {
    handL = drawArm(shoulderL, pose.lArm, pose.lElbow);
  }

  ctx.fillStyle = grad;
  ctx.strokeStyle = outline;
  ctx.beginPath();
  ctx.moveTo(shoulderL.x, shoulderL.y - m(0.03));
  ctx.quadraticCurveTo(neck.x, neck.y - m(0.04), shoulderR.x, shoulderR.y - m(0.03));
  ctx.quadraticCurveTo(shoulderR.x + m(0.04), shoulderR.y + m(0.08), hip.x + waistW, hip.y + m(0.02));
  ctx.lineTo(hip.x - waistW, hip.y + m(0.02));
  ctx.quadraticCurveTo(shoulderL.x - m(0.04), shoulderL.y + m(0.08), shoulderL.x, shoulderL.y - m(0.03));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Collar and a trim stripe.
  ctx.strokeStyle = kit.trim;
  ctx.lineWidth = Math.max(0.8, s * 0.025);
  ctx.beginPath();
  ctx.moveTo(neck.x - m(0.06), neck.y + m(0.01));
  ctx.lineTo(neck.x, neck.y + m(0.07));
  ctx.lineTo(neck.x + m(0.06), neck.y + m(0.01));
  ctx.stroke();
  ctx.lineWidth = Math.max(0.6, s * 0.012);
  if (pose.facing === -1 && kit.number && s > 18) {
    ctx.fillStyle = kit.trim;
    ctx.font = `800 ${m(0.17)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(kit.number, neck.x, neck.y + m(0.24));
  }

  if (pose.facing === 1) {
    handL = drawArm(shoulderL, pose.lArm, pose.lElbow);
  } else {
    handR = drawArm(shoulderR, pose.rArm, pose.rElbow);
  }

  // Neck and head.
  const headR = m(0.105);
  const head: Pt = { x: neck.x + Math.sin(pose.lean) * m(0.03), y: neck.y - m(0.13) };
  limb(ctx, { x: neck.x, y: neck.y + m(0.02) }, { x: head.x, y: head.y + headR * 0.6 }, m(0.04), m(0.04), kit.skin, outline);
  ctx.fillStyle = kit.skin;
  ctx.strokeStyle = outline;
  ctx.beginPath();
  ctx.ellipse(head.x, head.y, headR * 0.9, headR, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (pose.facing === -1 || kit.head === "none") {
    // Hair from behind.
    ctx.fillStyle = kit.hair;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - headR * 0.15, headR * 0.92, headR * 0.85, 0, Math.PI, 0);
    ctx.fill();
  }
  if (kit.head === "cap") {
    ctx.fillStyle = kit.capColour ?? kit.trim;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - headR * 0.35, headR * 0.98, headR * 0.72, 0, Math.PI, 0);
    ctx.fill();
    if (pose.facing === 1) {
      ctx.beginPath();
      ctx.ellipse(head.x, head.y - headR * 0.3, headR * 1.05, headR * 0.22, 0, 0, Math.PI);
      ctx.fill();
    }
  } else if (kit.head === "helmet") {
    ctx.fillStyle = "#18264f";
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - headR * 0.1, headR * 1.15, headR * 1.12, 0, Math.PI * 1.02, Math.PI * 1.98);
    ctx.lineTo(head.x + headR * 1.1, head.y + headR * 0.35);
    ctx.lineTo(head.x - headR * 1.1, head.y + headR * 0.35);
    ctx.closePath();
    ctx.fill();
    if (pose.facing === 1) {
      // Grille.
      ctx.strokeStyle = "#cfd4de";
      ctx.lineWidth = Math.max(0.6, s * 0.012);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(head.x - headR * 0.85, head.y + headR * (0.25 + i * 0.22));
        ctx.lineTo(head.x + headR * 0.85, head.y + headR * (0.25 + i * 0.22));
        ctx.stroke();
      }
    }
  } else if (kit.head === "hat") {
    ctx.fillStyle = "#f7f7f2";
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - headR * 0.45, headR * 1.7, headR * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - headR * 0.55, headR * 0.95, headR * 0.75, 0, Math.PI, 0);
    ctx.fill();
  }
  if (pose.facing === 1 && kit.head !== "helmet" && s > 30) {
    // A hint of a face: eyes and a beard line read at broadcast size.
    ctx.fillStyle = "rgba(30,20,15,0.8)";
    ctx.fillRect(head.x - headR * 0.4, head.y - headR * 0.05, headR * 0.18, headR * 0.1);
    ctx.fillRect(head.x + headR * 0.22, head.y - headR * 0.05, headR * 0.18, headR * 0.1);
  }
  ctx.restore();
  return { hip, shoulderL, shoulderR, handL: handL!, handR: handR!, head, headR };
}
