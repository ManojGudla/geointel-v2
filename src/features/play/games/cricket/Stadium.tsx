import { memo } from "react";
import { AIM_LABEL, CONTACT_WINDOWS, type Aim, type Outcome, type UmpireSignal } from "./timing";
import { Batter, Bowler, Fielder, Stumps, Umpire } from "./Figures";
import "./Stadium.css";

/**
 * The ground, at night, from behind the keeper.
 *
 * This is the standard television angle and it is chosen for a reason beyond
 * looking familiar: it is the only view where a ball travelling towards you
 * reads as a ball travelling towards YOU, which is the entire game. A side-on
 * view would be prettier and would destroy the timing.
 *
 * The first version of this scene was a diagram — two flat ellipses for the
 * stands, four arcs of dots for a crowd, a couple of sticks for floodlights. It
 * was honest about what it was and it looked like it. This one is built the way
 * a scene is built rather than the way a chart is: a bowl with tiers and a roof
 * that occlude each other in the right order, four floodlights with visible
 * lamp banks casting overlapping pools of light onto the grass, mowing lines
 * that converge towards the far end, haze thickening at the boundary, and a
 * sight screen sitting exactly where a sight screen sits.
 *
 * Everything is still drawn — SVG and CSS, no images, not one downloaded byte —
 * so it stays sharp at any size and costs the page nothing. It is a stylised
 * ground, not a photographed one, and it is not pretending otherwise.
 *
 * PERFORMANCE NOTE, and it is the reason for the memo below. This component
 * re-renders on every animation frame while the ball is in flight, because
 * `progress` changes sixty times a second. The scene behind the play has
 * several hundred elements in it and none of them depend on the ball, so it
 * lives in its own memoised component keyed only on the crowd's mood. Without
 * that, adding this much detail would have cost frames — and a timing game that
 * drops frames is a timing game that feels unfair.
 */

/* ────────────────────────────────────────────────────────────────────────────
   The bowl.

   Every ring of the stadium is an ellipse sharing one centre below the frame
   and one aspect ratio, so they nest without ever crossing and the whole
   structure reads as a single bowl seen from inside it. Drawing them
   outermost-first means each ring covers the interior of the last, which is
   what produces the tiers: no masks, no clipping, just correct order.
   ──────────────────────────────────────────────────────────────────────────── */

const K = 1.55;
const BOWL_CY = 300;
const ring = (ry: number) => ({ cx: 200, cy: BOWL_CY, rx: Math.round(ry * K * 10) / 10, ry });

const R_ROOF = 266; // y=34 at centre
const R_ROOF_LIP = 250; // y=50
const R_UPPER_TOP = 246; // y=54
const R_UPPER_BOT = 220; // y=80
const R_CONC_BOT = 212; // y=88
const R_LOWER_BOT = 186; // y=114
const R_BOARD_BOT = 178; // y=122, where the grass takes over

/* ── The crowd ─────────────────────────────────────────────────────────────
   Two layers. Underneath, a tiled speckle pattern gives the tiers real density
   at the cost of one element each. On top, a few hundred individual figures in
   muted clothing carry the colour and are the ones that move when the ball goes
   into the stand. Thousands of separate circles would look no better and would
   cost frames.
   ──────────────────────────────────────────────────────────────────────────── */

interface Fan {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  delay: number;
}

/**
 * What people are actually wearing.
 *
 * The first pass generated hues right round the wheel, and the result was
 * candy: a stand full of pastel confetti. A crowd under floodlight is nothing
 * like that. It is overwhelmingly dark and desaturated — navy, charcoal, brown,
 * olive, faded denim — with a handful of bright shirts scattered through it,
 * and it is precisely that ratio of dull to bright that makes a texture read as
 * thousands of people rather than as decoration.
 */
const SHIRTS = [
  "#3b4557",
  "#4a4450",
  "#55503f",
  "#39505e",
  "#4e403e",
  "#3f5245",
  "#5a5764",
  "#63543f",
  "#2d3a4e",
  "#5f4b3c",
  "#46505f",
  "#514a44",
];
/** One in eleven. Enough to give the stand life, few enough to stay a crowd. */
const BRIGHT = ["#c8d4e6", "#c9a05a", "#7fa8d8", "#b06a63"];

/** Gangways, which are the strongest single structural cue a stand has. */
const AISLES = [0.95, 1.11, 1.27, 1.43, 1.59, 1.75, 1.91, 2.07, 2.22];

function tierFans(ryOuter: number, ryInner: number, rows: number, perRow: number, r: number, seed: number): Fan[] {
  const out: Fan[] = [];
  for (let row = 0; row < rows; row++) {
    const t = rows === 1 ? 0 : row / (rows - 1);
    const ry = ryOuter + (ryInner - ryOuter) * t;
    const rx = ry * K;
    // Only the arc that actually crosses the frame is worth generating.
    const c = Math.min(0.999, 208 / rx);
    const a0 = Math.acos(c);
    const a1 = Math.PI - a0;
    for (let i = 0; i < perRow; i++) {
      const u = (i + 0.5) / perRow;
      const a = a0 + (a1 - a0) * u;
      // Nobody sits in the gangway.
      if (AISLES.some((g) => Math.abs(g - a) < 0.016)) continue;
      // Jitter, so the rows read as people rather than as a grid of dots.
      const n = (i * 37 + row * 53 + seed * 17) % 13;
      const j = (n / 13 - 0.5) * 2;
      out.push({
        cx: Math.round((200 - rx * Math.cos(a) + j * 1.4) * 10) / 10,
        cy: Math.round((BOWL_CY - ry * Math.sin(a) + j * 0.8) * 10) / 10,
        r,
        fill: n === 4 ? BRIGHT[(i + row) % BRIGHT.length]! : SHIRTS[(i * 5 + row * 7 + seed) % SHIRTS.length]!,
        delay: ((i * 7 + row * 13) % 16) * 55,
      });
    }
  }
  return out;
}

/* Computed once at module load: deterministic, and a few hundred cheap sums. */
const FANS: Fan[] = [
  ...tierFans(R_UPPER_TOP - 3, R_UPPER_BOT + 3, 5, 54, 0.95, 1),
  ...tierFans(R_CONC_BOT - 3, R_LOWER_BOT + 4, 4, 46, 1.15, 2),
];

/** The line of a gangway, from the roof edge down to the perimeter boards. */
function aisleLine(a: number) {
  return {
    x1: 200 - R_ROOF_LIP * K * Math.cos(a),
    y1: BOWL_CY - R_ROOF_LIP * Math.sin(a),
    x2: 200 - R_LOWER_BOT * K * Math.cos(a),
    y2: BOWL_CY - R_LOWER_BOT * Math.sin(a),
  };
}

/* ── Floodlights ───────────────────────────────────────────────────────────
   Four pylons around the far rim, at the heights the bowl's own curve puts
   them. Each is a lattice mast and a bank of lamps, and each throws a cone into
   the air and a pool onto the grass. The overlapping pools are the thing that
   actually says "night match": a single even wash says "daylight, dimmed".
   ──────────────────────────────────────────────────────────────────────────── */

const PYLONS = [
  { x: 44, top: 16, w: 27, h: 15, mast: 23, lamps: 6 },
  { x: 147, top: 2, w: 23, h: 13, mast: 21, lamps: 5 },
  { x: 253, top: 2, w: 23, h: 13, mast: 21, lamps: 5 },
  { x: 356, top: 16, w: 27, h: 15, mast: 23, lamps: 6 },
];

/* Where each light lands. Deliberately not centred under the pylons: light from
   a rim throws across the ground, not straight down. */
const POOLS = [
  { cx: 128, cy: 214, rx: 150, ry: 88 },
  { cx: 200, cy: 172, rx: 130, ry: 62 },
  { cx: 272, cy: 214, rx: 150, ry: 88 },
  { cx: 200, cy: 268, rx: 170, ry: 78 },
];

/* ── The outfield ──────────────────────────────────────────────────────────
   Mowing lines run up and down the ground, which from this end converge towards
   the far boundary. Drawn as wedges from a vanishing band rather than as
   concentric rings, because convergence is the single strongest depth cue
   available in a flat drawing and rings give none of it.
   ──────────────────────────────────────────────────────────────────────────── */

const STRIPES = Array.from({ length: 15 }, (_, i) => i - 7).filter((i) => i % 2 === 0);
/** Half-width of one mown band at the far end, and at the bottom of the frame. */
const STRIPE_FAR = 5.5;
const STRIPE_NEAR = 50;

/* ── Fielders ──────────────────────────────────────────────────────────────
   Real placings, not a decorative scatter: slip and gully behind square on the
   off side, mid-on and mid-off straight, square leg and fine leg on the leg
   side, sweepers on the rope. A player who knows cricket should look at this
   and see a field.

   x runs 0 (leg side) to 1 (off side); y runs 0 (far boundary) to 1 (batter).
   ──────────────────────────────────────────────────────────────────────────── */

const FIELD: Array<{ x: number; y: number }> = [
  { x: 0.6, y: 0.8 }, // slip
  { x: 0.72, y: 0.68 }, // gully
  { x: 0.82, y: 0.54 }, // point
  { x: 0.8, y: 0.3 }, // deep cover
  { x: 0.63, y: 0.44 }, // mid-off
  { x: 0.56, y: 0.1 }, // long-off
  { x: 0.38, y: 0.44 }, // mid-on
  { x: 0.2, y: 0.3 }, // deep midwicket
  { x: 0.18, y: 0.56 }, // square leg
  { x: 0.33, y: 0.1 }, // fine leg
];

/** Where the fielders shift when the bowler is countering a favourite shot. */
const SHIFT: Record<Aim, { x: number; y: number }> = {
  leg: { x: -0.06, y: -0.04 },
  off: { x: 0.06, y: -0.04 },
  straight: { x: 0, y: -0.07 },
};

const UMPIRE_LABEL: Record<Exclude<UmpireSignal, "none">, string> = {
  out: "OUT",
  four: "FOUR",
  six: "SIX",
  "wide-arms": "WIDE",
};

/* ────────────────────────────────────────────────────────────────────────────
   The scene: everything that does not move with the ball.
   ──────────────────────────────────────────────────────────────────────────── */

const Ground = memo(function Ground() {
  return (
    <svg className="stadium__scene" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="cr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#040812" />
          <stop offset="55%" stopColor="#0b1730" />
          <stop offset="100%" stopColor="#1b3355" />
        </linearGradient>
        <linearGradient id="cr-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#070c17" />
          <stop offset="100%" stopColor="#0d1524" />
        </linearGradient>
        <linearGradient id="cr-rooflit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a5075" />
          <stop offset="100%" stopColor="#1d2b45" />
        </linearGradient>
        <linearGradient id="cr-facade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b1322" />
          <stop offset="100%" stopColor="#16203a" />
        </linearGradient>
        {/* Grass is brightest where the lights cross, at the middle of the
            square, and falls away hard towards the rope. */}
        <radialGradient id="cr-grass" cx="50%" cy="72%" r="78%">
          <stop offset="0%" stopColor="#3a8446" />
          <stop offset="55%" stopColor="#2a6636" />
          <stop offset="100%" stopColor="#15421f" />
        </radialGradient>
        <linearGradient id="cr-pitch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b39c72" />
          <stop offset="45%" stopColor="#d3bd90" />
          <stop offset="100%" stopColor="#e6d4a9" />
        </linearGradient>
        <linearGradient id="cr-square" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8e8560" />
          <stop offset="100%" stopColor="#ab9d75" />
        </linearGradient>
        <linearGradient id="cr-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cfe2ff" stopOpacity="0.2" />
          <stop offset="40%" stopColor="#cfe2ff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#cfe2ff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="cr-pool">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cr-lampglow">
          <stop offset="0%" stopColor="#eaf3ff" stopOpacity="0.75" />
          <stop offset="45%" stopColor="#9fc4ff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#9fc4ff" stopOpacity="0" />
        </radialGradient>
        {/* Haze sitting on the far boundary. Air over a lit ground is not
            clear, and the thickening towards the rope is most of why a drawing
            reads as deep rather than flat. */}
        <linearGradient id="cr-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8fb6e8" stopOpacity="0" />
          <stop offset="45%" stopColor="#8fb6e8" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#8fb6e8" stopOpacity="0" />
        </linearGradient>
        {/* A sight screen is off-white and it is lit from the front, not glowing.
            The first version was a lightbox and pulled the eye straight off the
            pitch. */}
        <linearGradient id="cr-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c3ccda" />
          <stop offset="100%" stopColor="#9aa6b8" />
        </linearGradient>

        {/* The crowd, as a texture. One element, thousands of people. */}
        <pattern id="cr-crowd" width="4" height="3" patternUnits="userSpaceOnUse">
          <rect width="4" height="3" fill="#0f1626" />
          <circle cx="1" cy="0.9" r="0.62" fill="#232e46" />
          <circle cx="3" cy="2.2" r="0.62" fill="#1b2438" />
        </pattern>

        {/* Perimeter boards. Abstract colour blocks, which is exactly what
            advertising hoardings look like at this distance under lights —
            and carries nobody else's name. */}
        <pattern id="cr-boards" width="34" height="10" patternUnits="userSpaceOnUse">
          <rect width="34" height="10" fill="#0f1a2c" />
          <rect x="0.6" y="1" width="9" height="8" rx="1" fill="#2f6fd0" opacity="0.75" />
          <rect x="10.4" y="1" width="7" height="8" rx="1" fill="#e8a33d" opacity="0.6" />
          <rect x="18.2" y="1" width="8" height="8" rx="1" fill="#d9e4f5" opacity="0.42" />
          <rect x="27" y="1" width="6.4" height="8" rx="1" fill="#2f9e8f" opacity="0.6" />
        </pattern>

        {/* Everything drawn on the grass gets clipped to the grass. */}
        <clipPath id="cr-turf">
          <ellipse cx="200" cy="330" rx="290" ry="215" />
        </clipPath>
      </defs>

      <rect width="400" height="300" fill="url(#cr-sky)" />

      {/*
        Light in the air, and only in the air.

        These were drawn over the stands to begin with and they read as
        shadows, not as beams: a translucent wash laid over a lit crowd flattens
        it, and the eye calls anything flatter than its surroundings a shadow.
        Drawn first, so the bowl covers them, they do the one job a visible beam
        should do — say that there is haze above the ground and something is
        shining through it — and then get out of the way.
      */}
      {PYLONS.map((p) => (
        <path
          key={`beam-${p.x}`}
          d={`M${p.x - p.w / 2} ${p.top + p.h} L${p.x - 74} 300 L${p.x + 74} 300 L${p.x + p.w / 2} ${p.top + p.h} Z`}
          fill="url(#cr-beam)"
        />
      ))}

      {/* ── The bowl, outermost ring first ──────────────────────────────── */}
      <ellipse {...ring(R_ROOF)} fill="url(#cr-roof)" />
      <ellipse {...ring(R_ROOF_LIP)} fill="url(#cr-rooflit)" />
      {/* The fascia. A stadium roof reads as a roof because its leading edge is
          lit from below and everything above it is not. */}
      <ellipse {...ring(R_ROOF - 1.2)} fill="none" stroke="#6d86ad" strokeWidth="1.6" opacity="0.5" />
      {/* Roof supports: verticals dropping from the canopy into the upper tier.
          Structure is what separates a stand from a shaded band. */}
      <g opacity="0.55">
        {[18, 62, 106, 150, 200, 250, 294, 338, 382].map((x) => {
          const dx = (x - 200) / (R_ROOF_LIP * K);
          if (Math.abs(dx) >= 1) return null;
          const yTop = BOWL_CY - R_ROOF_LIP * Math.sqrt(1 - dx * dx);
          const dx2 = (x - 200) / (R_UPPER_BOT * K);
          const yBot = BOWL_CY - R_UPPER_BOT * Math.sqrt(1 - Math.min(0.999, dx2 * dx2));
          return <rect key={x} x={x - 0.7} y={yTop} width="1.4" height={Math.max(0, yBot - yTop)} fill="#0a111f" />;
        })}
      </g>
      <ellipse {...ring(R_UPPER_TOP)} fill="url(#cr-crowd)" />
      <ellipse {...ring(R_UPPER_BOT)} fill="url(#cr-facade)" />
      {/* Concourse lights behind the facade. */}
      <g opacity="0.5">
        {[30, 74, 118, 168, 232, 282, 326, 370].map((x) => {
          const dx = (x - 200) / (R_UPPER_BOT * K);
          if (Math.abs(dx) >= 1) return null;
          const y = BOWL_CY - R_UPPER_BOT * Math.sqrt(1 - dx * dx);
          return <rect key={x} x={x - 3} y={y + 2} width="6" height="2.4" rx="1" fill="#f0c987" opacity="0.5" />;
        })}
      </g>
      <ellipse {...ring(R_CONC_BOT)} fill="url(#cr-crowd)" />
      <ellipse {...ring(R_LOWER_BOT)} fill="url(#cr-boards)" />
      <ellipse {...ring(R_BOARD_BOT)} fill="#0a1a12" />

      {/* The people. */}
      <g className="stadium__crowd">
        {FANS.map((f, i) => (
          <circle
            key={i}
            className="stadium__fan"
            cx={f.cx}
            cy={f.cy}
            r={f.r}
            fill={f.fill}
            style={{ animationDelay: `${f.delay}ms` }}
          />
        ))}
      </g>

      {/* Gangways, cut through both tiers. */}
      {AISLES.map((a) => {
        const l = aisleLine(a);
        return <line key={a} {...l} stroke="#080e1a" strokeWidth="2.6" opacity="0.85" />;
      })}
      {/* Seat rows. Four dark arcs are enough for the eye to count rows it
          cannot actually see. */}
      {[238, 230, 205, 196].map((ry) => (
        <ellipse key={ry} {...ring(ry)} fill="none" stroke="#060b14" strokeWidth="0.9" opacity="0.45" />
      ))}

      {/* ── Floodlights ─────────────────────────────────────────────────── */}
      {PYLONS.map((p) => {
        const headBottom = p.top + p.h;
        const cols = p.lamps;
        return (
          <g key={p.x}>
            {/* Lattice mast: two legs and a run of cross braces. */}
            <path
              d={`M${p.x - 2.6} ${headBottom + p.mast} L${p.x - 1.2} ${headBottom} L${p.x + 1.2} ${headBottom} L${p.x + 2.6} ${headBottom + p.mast} Z`}
              fill="#28344a"
            />
            {Array.from({ length: 4 }, (_, i) => {
              const t = (i + 0.5) / 4;
              const y = headBottom + p.mast * t;
              const w = 1.2 + 1.4 * t;
              return <rect key={i} x={p.x - w} y={y} width={w * 2} height="0.7" fill="#3c4a64" />;
            })}
            {/* The glow has to sit behind the lamps, not in front of them. */}
            <ellipse cx={p.x} cy={p.top + p.h / 2} rx={p.w * 1.5} ry={p.h * 1.9} fill="url(#cr-lampglow)" />
            <rect x={p.x - p.w / 2} y={p.top} width={p.w} height={p.h} rx="1.4" fill="#1b2436" />
            {Array.from({ length: cols * 3 }, (_, i) => {
              const col = i % cols;
              const row = Math.floor(i / cols);
              return (
                <circle
                  key={i}
                  cx={p.x - p.w / 2 + 2.4 + col * ((p.w - 4.8) / (cols - 1))}
                  cy={p.top + 3 + row * ((p.h - 6) / 2)}
                  r="1.25"
                  fill="#f4f9ff"
                  opacity="0.92"
                />
              );
            })}
          </g>
        );
      })}

      {/* ── The sight screen, behind the bowler's arm where it belongs ──── */}
      <path d="M158 122 L242 122 L238 100 L162 100 Z" fill="url(#cr-screen)" />
      <path d="M158 122 L242 122 L241.4 119 L158.6 119 Z" fill="#7d8a9e" />
      <path d="M162 100 L238 100 L237.7 101.8 L162.3 101.8 Z" fill="#93a0b2" />
      <rect x="171" y="121" width="3.4" height="7" fill="#182238" />
      <rect x="225" y="121" width="3.4" height="7" fill="#182238" />

      {/* ── The outfield ────────────────────────────────────────────────── */}
      <ellipse cx="200" cy="330" rx="290" ry="215" fill="url(#cr-grass)" />

      <g clipPath="url(#cr-turf)">
        {/* Mowing lines, converging on the far end. */}
        {STRIPES.map((i) => (
          <path
            key={i}
            d={`M${200 + i * STRIPE_FAR} 114 L${200 + (i + 1) * STRIPE_FAR} 114 L${200 + (i + 1) * STRIPE_NEAR} 302 L${200 + i * STRIPE_NEAR} 302 Z`}
            fill="#ffffff"
            opacity="0.04"
          />
        ))}
        {/* Light on the grass, thrown from the rim. */}
        {POOLS.map((p, i) => (
          <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill="url(#cr-pool)" />
        ))}
      </g>

      {/* The rope, and the 30-yard circle. */}
      <ellipse cx="200" cy="330" rx="286" ry="211" fill="none" stroke="#eef4ff" strokeOpacity="0.42" strokeWidth="1.4" />
      <ellipse
        cx="200"
        cy="322"
        rx="168"
        ry="118"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.2"
        strokeWidth="1.1"
        strokeDasharray="6 5"
      />

      {/* ── The square ──────────────────────────────────────────────────── */}
      {/* A real ground has a whole square of strips and plays one of them. */}
      <path d="M160 130 L240 130 L292 302 L108 302 Z" fill="url(#cr-square)" opacity="0.6" />
      {[-2, -1, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${200 + i * 19.5} 130 L${200 + i * 19.5 + 1} 130 L${200 + i * 43 + 2} 302 L${200 + i * 43} 302 Z`}
          fill="#8a7e5c"
          opacity="0.5"
        />
      ))}

      {/* The strip in play. */}
      <path d="M182 131 L218 131 L248 302 L152 302 Z" fill="url(#cr-pitch)" />
      {/* Wear: the bowler's follow through, and the patch a good length lands
          on. Both in the right places, and both the reason a used pitch looks
          used. */}
      <ellipse cx="206" cy="178" rx="6" ry="10" fill="#a9926a" opacity="0.22" />
      <ellipse cx="195" cy="188" rx="5" ry="9" fill="#a9926a" opacity="0.18" />
      <ellipse cx="200" cy="214" rx="13" ry="7" fill="#b8a075" opacity="0.2" />

      {/* Creases, at both ends, in the right relationship to the stumps. */}
      <g stroke="#fdfbf3" strokeOpacity="0.85" fill="none">
        <path d="M180 149 L220 149" strokeWidth="1" />
        <path d="M173 158 L227 158" strokeWidth="1.2" />
        <path d="M184 149 L183.4 160" strokeWidth="0.9" />
        <path d="M216 149 L216.6 160" strokeWidth="0.9" />

        <path d="M162 262 L238 262" strokeWidth="1.4" />
        <path d="M152 244 L248 244" strokeWidth="1.8" />
        <path d="M173 244 L171 276" strokeWidth="1.2" />
        <path d="M227 244 L229 276" strokeWidth="1.2" />
      </g>

      {/* Bowler's stumps at the far end. */}
      {[195.4, 200, 204.6].map((x) => (
        <rect key={x} x={x - 0.85} y="138" width="1.7" height="11" rx="0.7" fill="#f4eddc" />
      ))}
      <rect x="194.6" y="136.6" width="4.3" height="1.1" rx="0.5" fill="#f4eddc" />
      <rect x="199.2" y="136.6" width="4.3" height="1.1" rx="0.5" fill="#f4eddc" />

      {/* ── Air ─────────────────────────────────────────────────────────── */}
      <rect x="0" y="86" width="400" height="106" fill="url(#cr-haze)" />
    </svg>
  );
});

/** The set field, which changes only when the bowler moves it. */
const FieldSet = memo(function FieldSet({ sx, sy }: { sx: number; sy: number }) {
  return (
    <div className="stadium__fielders" aria-hidden="true">
      {FIELD.map((f, i) => {
        const y = f.y + sy;
        /**
         * Two corrections over the naive placement, both learned by looking at
         * the rendered ground.
         *
         * The depth axis runs 0 at the far boundary to 1 at the batter, so a
         * slip fielder belongs LOW on the screen; the first version put him at
         * 28% — standing in the crowd. The grass runs from about 48% to 93%,
         * and fielders are mapped into exactly that band.
         *
         * And x converges with depth. The ground is drawn in perspective, so
         * the same distance square of the wicket covers far fewer screen pixels
         * at the far boundary than near the bat, and a flat x put deep fielders
         * outside the rope.
         */
        const left = (0.5 + (f.x + sx - 0.5) * (0.55 + y * 1.05)) * 100;
        const top = 48 + y * 45;
        // Size falls off with distance on a continuous curve rather than in two
        // fixed steps, so the field recedes instead of arriving in two sizes.
        const scale = 0.44 + y * 0.62;
        return (
          <span
            key={i}
            className="stadium__fielder"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${2.7 * scale}%`,
              height: `${5.4 * scale}%`,
              opacity: 0.62 + y * 0.34,
            }}
          >
            <Fielder />
          </span>
        );
      })}
    </div>
  );
});

/* ────────────────────────────────────────────────────────────────────────────
   The play.
   ──────────────────────────────────────────────────────────────────────────── */

export function Stadium({
  progress,
  phase,
  aim,
  outcome,
  signal,
  crowd,
  running,
  guarding,
  travelMs,
  forgiveness,
  fullscreen,
  onToggleFullscreen,
  onSwing,
}: {
  /** 0 at release, 1 at the bat, up to 1.35 past it. */
  progress: number;
  phase: "ready" | "runup" | "travelling" | "result" | "done";
  aim: Aim;
  outcome: Outcome | null;
  signal: UmpireSignal;
  /** "roar" for a boundary, "groan" for a wicket. */
  crowd: "idle" | "roar" | "groan";
  /** Runs being run, so the batters actually change ends. */
  running: number;
  /** The shot the bowler is trying to take away, if any. */
  guarding: Aim | null;
  /** How long this ball takes to reach the bat, so the meter matches it. */
  travelMs: number;
  /** How wide this ball's windows are — a bouncer is far more forgiving. */
  forgiveness: number;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onSwing: () => void;
}) {
  const travelling = phase === "travelling";
  // The ball starts small and far away and arrives large and near, which is
  // what makes a flat screen read as depth.
  const ballY = Math.min(1.15, progress);
  const ballScale = 0.42 + ballY * 0.95;
  /**
   * The bounce. A ball that travels in a straight line down the screen reads as
   * a dot sliding; a ball that dips into the pitch and kicks up reads as a
   * delivery. Pitching around 62% of the way down is a good length.
   */
  const bounceAt = 0.62;
  const bounceLift = ballY < bounceAt ? 0 : Math.sin(((ballY - bounceAt) / (1 - bounceAt)) * Math.PI) * 3.4;
  /** Spin on the seam, so the ball is visibly rotating as it comes. */
  const ballSpin = ballY * 900;

  const shift = guarding ? SHIFT[guarding] : { x: 0, y: 0 };

  /**
   * The timing meter.
   *
   * The windows are drawn from the SAME constants the scoring uses
   * (CONTACT_WINDOWS in timing.ts), converted from milliseconds into a fraction
   * of the ball's flight, so what the player aims at is exactly what they are
   * judged against — not an illustration of it.
   */
  const METER_END = 1.35;
  const windowFraction = (ms: number) => (ms * forgiveness) / travelMs / METER_END;
  const contactAt = 1 / METER_END;
  const perfect = windowFraction(CONTACT_WINDOWS.perfect);
  const good = windowFraction(CONTACT_WINDOWS.good);
  const edge = windowFraction(CONTACT_WINDOWS.edge);
  const markerAt = Math.min(1, progress / METER_END);

  // How close the ball is to the middle right now, 0 to 1. Drives the glow on
  // the contact band, so the pitch itself says "now" as well as the meter.
  const nearness = travelling ? Math.max(0, 1 - Math.abs(progress - 1) / (good * METER_END)) : 0;

  return (
    <div
      className={`stadium stadium--${phase} stadium--crowd-${crowd}`}
      role="button"
      tabIndex={0}
      aria-label="The pitch. Tap or press space to play your shot."
      onClick={onSwing}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSwing();
      }}
    >
      {/*
        The camera.

        Everything that belongs to the world sits inside this one element, and
        it pushes in as the bowler runs and holds tight through the delivery,
        the way a broadcast camera does. Because the ball, the contact band and
        the batter all scale together inside it, the move cannot put what you
        see out of step with what you are scored on — which is why the meter and
        the prompt deliberately stay outside.
      */}
      <div className="stadium__camera">
        <Ground />

        <FieldSet sx={shift.x} sy={shift.y} />

        {/* ── The bowler, running in ─────────────────────────────────────── */}
        <div className={`stadium__bowler${phase === "runup" ? " stadium__bowler--running" : ""}`} aria-hidden="true">
          <Bowler phase={phase === "travelling" ? 1 : 0} />
        </div>

        {/* ── The ball ───────────────────────────────────────────────────── */}
        {(travelling || phase === "result") && (
          <div
            className="stadium__ball"
            aria-hidden="true"
            style={{
              /**
               * The ball must ARRIVE at the bat exactly when progress hits 1,
               * because that is the instant the timing maths calls perfect. It
               * used to stop short, and the natural correction to that is to
               * wait, which scores as late: the game felt inaccurate because it
               * was.
               */
              top: `${26 + ballY * 48}%`,
              transform: `translate(-50%, calc(-50% - ${bounceLift}%)) scale(${ballScale}) rotate(${ballSpin}deg)`,
              opacity: phase === "result" ? 0 : 1,
            }}
          />
        )}

        {/* The ball's flight, drawn behind it. Three fading copies is enough for
            the eye to read a path rather than a jump between frames. */}
        {travelling &&
          [0.06, 0.13, 0.21].map((lag, i) => (
            <div
              key={lag}
              className="stadium__trail"
              aria-hidden="true"
              style={{
                top: `${26 + Math.max(0, ballY - lag) * 48}%`,
                transform: `translate(-50%, -50%) scale(${(0.42 + Math.max(0, ballY - lag) * 0.95) * (0.8 - i * 0.16)})`,
                opacity: 0.4 - i * 0.12,
              }}
            />
          ))}

        {/* ── The striker's stumps and the batter ────────────────────────── */}
        <div className="stadium__stumps" aria-hidden="true">
          <Stumps broken={outcome === "out" && phase === "result"} />
        </div>

        <div className={`stadium__batter${running > 0 ? " stadium__batter--running" : ""}`} aria-hidden="true">
          <Batter swing={phase === "result" ? 1 : travelling ? Math.max(0, (progress - 0.72) / 0.3) : 0} />
        </div>

        {running > 0 && (
          <div className="stadium__runner" aria-hidden="true">
            <Bowler phase={0.5} kit="#e8eef8" />
            <span className="stadium__runner-count">
              {running} run{running === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {/* ── The umpire, at square leg where he stands ──────────────────── */}
        <div className={`stadium__umpire${signal !== "none" ? " stadium__umpire--signalling" : ""}`} aria-hidden="true">
          <Umpire signal={signal} />
          {signal !== "none" && <span className="stadium__umpire-call">{UMPIRE_LABEL[signal]}</span>}
        </div>

        {/*
          A slip fielder, right on the lens.

          One figure in the near foreground, thrown out of focus, does more for
          depth than anything drawn behind the action — it gives the eye
          something to measure the distance to the pitch against. Pushed to the
          off-side edge and cropped, so it frames the shot without ever sitting
          between the player and the ball.
        */}
        <div className="stadium__near" aria-hidden="true">
          <Fielder />
        </div>

        {/*
          The moment of contact.

          A timing game needs the instant of impact to be unmistakable, and a
          number appearing under the pitch a beat later is not that. The flash
          fires on the frame the shot is played, sized by how well it was
          middled, so a six looks like a six before you have read a word.
        */}
        {phase === "result" && outcome !== null && (
          <div
            className={`stadium__impact stadium__impact--${outcome === "out" ? "out" : outcome >= 4 ? "big" : outcome > 0 ? "run" : "dot"}`}
            aria-hidden="true"
          />
        )}

        {/*
          The contact band, on the pitch where the shot is actually played.

          The flat-pitch version had one and replacing it with the stadium
          silently dropped it. That is the whole of "where to hit" — a beautiful
          ground with no indication of when to swing is worse to play than an
          ugly one with a stripe on it. It is cut to the pitch's own perspective
          now, so it reads as light falling on the strip rather than as a bar
          floating over it.
        */}
        <div
          className="stadium__zone"
          aria-hidden="true"
          style={{
            opacity: 0.22 + nearness * 0.78,
            boxShadow: `0 0 ${8 + nearness * 34}px ${nearness * 12}px rgba(255, 214, 107, ${nearness * 0.85})`,
          }}
        />
      </div>

      {/* Confetti on a boundary. Fired from the bat, not the top of the frame,
          so it reads as a consequence of the shot. */}
      {crowd === "roar" && (
        <div className="stadium__confetti" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <span
              key={i}
              style={{
                left: `${8 + i * 5}%`,
                background: `hsl(${(i * 47) % 360} 78% 60%)`,
                animationDelay: `${i * 32}ms`,
                animationDuration: `${900 + (i % 5) * 160}ms`,
              }}
            />
          ))}
        </div>
      )}

      {/* Lens: a vignette and a little grain over everything in the world, and
          nothing over the controls. */}
      <div className="stadium__lens" aria-hidden="true" />

      {/* ── Full screen ──────────────────────────────────────────────────── */}
      <button
        type="button"
        className="stadium__fs"
        onClick={(e) => {
          // Must not also count as a shot.
          e.stopPropagation();
          onToggleFullscreen();
        }}
        aria-label={fullscreen ? "Leave full screen" : "Play in full screen"}
        title={fullscreen ? "Leave full screen" : "Play in full screen"}
      >
        {fullscreen ? "✕" : "⛶"}
      </button>

      {/* The meter. Drawn from the real scoring windows — see above. */}
      {(travelling || phase === "runup") && (
        <div className="stadium__meter" aria-hidden="true">
          <div className="stadium__meter-track">
            <span
              className="stadium__meter-band stadium__meter-band--edge"
              style={{ left: `${(contactAt - edge) * 100}%`, width: `${edge * 2 * 100}%` }}
            />
            <span
              className="stadium__meter-band stadium__meter-band--good"
              style={{ left: `${(contactAt - good) * 100}%`, width: `${good * 2 * 100}%` }}
            />
            <span
              className="stadium__meter-band stadium__meter-band--perfect"
              style={{ left: `${(contactAt - perfect) * 100}%`, width: `${perfect * 2 * 100}%` }}
            />
            <span className="stadium__meter-mark" style={{ left: `${markerAt * 100}%` }} />
          </div>
        </div>
      )}

      {/* ── The prompt ───────────────────────────────────────────────────── */}
      <div className={`stadium__prompt${travelling ? " stadium__prompt--live" : ""}`}>
        {phase === "runup"
          ? "Here it comes…"
          : travelling
            ? "NOW — tap or SPACE"
            : phase === "result"
              ? outcome === "out"
                ? "Out."
                : `${outcome} run${outcome === 1 ? "" : "s"}`
              : "Tap or press SPACE to face the next ball"}
      </div>

      {/* A corner chip, not a pill on the pitch. The previous version floated
          over the crease and the ball's flight path — the two things the eye
          must never be pulled away from. */}
      <div className="stadium__aim" aria-hidden="true">
        Aim <strong>{AIM_LABEL[aim]}</strong>
      </div>
    </div>
  );
}
