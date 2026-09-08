import { AIM_LABEL, CONTACT_WINDOWS, type Aim, type Outcome, type UmpireSignal } from "./timing";
import { Batter, Bowler, Fielder, Stumps, Umpire } from "./Figures";
import "./Stadium.css";

/**
 * The ground, from behind the bowler's arm.
 *
 * The game used to be played on a green rectangle with a dot travelling down
 * it. The timing underneath was already good, but nothing on screen said
 * "cricket" — no crowd, no fielders, no umpire, no sense that anything was at
 * stake beyond a number changing.
 *
 * This is the standard television angle, and it is chosen for a reason beyond
 * looking familiar: it is the only view where the ball travelling towards you
 * reads as a ball travelling towards YOU, which is the entire game. A side-on
 * view would be prettier and would destroy the timing.
 *
 * Everything is drawn — SVG and CSS, no images. A cricket ground is circles,
 * an ellipse and some dots, and drawing it keeps the whole thing sharp at any
 * size, themeable, and free of a single downloaded byte.
 */

/**
 * Fielders, in real positions, given in fractions of the ground.
 *
 * These are actual field placings rather than a decorative scatter: slip and
 * gully behind square on the off side, mid-on and mid-off straight, square leg
 * and fine leg on the leg side, and the deep sweepers on the rope. A player
 * who knows cricket should be able to look at this and see a field.
 *
 * x runs 0 (leg side) to 1 (off side); y runs 0 (far boundary) to 1 (batter).
 */
const FIELD: Array<{ x: number; y: number; deep?: boolean }> = [
  { x: 0.6, y: 0.8 }, // slip
  { x: 0.72, y: 0.68 }, // gully
  { x: 0.82, y: 0.54 }, // point
  { x: 0.8, y: 0.3, deep: true }, // deep cover
  { x: 0.63, y: 0.44 }, // mid-off
  { x: 0.56, y: 0.1, deep: true }, // long-off
  { x: 0.38, y: 0.44 }, // mid-on
  { x: 0.2, y: 0.3, deep: true }, // deep midwicket
  { x: 0.18, y: 0.56 }, // square leg
  { x: 0.33, y: 0.1, deep: true }, // fine leg
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
   * The bounce. A ball that travels in a straight line down the screen reads
   * as a dot sliding; a ball that dips into the pitch and kicks up reads as a
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
   * This is the fix for "where to hit". The windows are drawn from the SAME
   * constants the scoring uses (CONTACT_WINDOWS in timing.ts), converted from
   * milliseconds into a fraction of the ball's flight, so what the player aims
   * at is exactly what they are judged against — not an illustration of it.
   *
   * The bar runs the whole flight, contact sits where the marker meets the
   * gold band, and the tail past it is the room you have to be late.
   */
  const METER_END = 1.35;
  const windowFraction = (ms: number) => (ms * forgiveness) / travelMs / METER_END;
  const contactAt = 1 / METER_END;
  const perfect = windowFraction(CONTACT_WINDOWS.perfect);
  const good = windowFraction(CONTACT_WINDOWS.good);
  const edge = windowFraction(CONTACT_WINDOWS.edge);
  const markerAt = Math.min(1, progress / METER_END);

  // How close the ball is to the middle right now, 0 to 1. Drives the glow on
  // the contact band so the pitch itself says "now" as well as the meter.
  const nearness = travelling ? Math.max(0, 1 - Math.abs(progress - 1) / (good * METER_END)) : 0;

  return (
    <div
      className={`stadium stadium--crowd-${crowd}`}
      role="button"
      tabIndex={0}
      aria-label="The pitch. Tap or press space to play your shot."
      onClick={onSwing}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSwing();
      }}
    >
      <svg className="stadium__scene" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="skyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b2a4a" />
            <stop offset="100%" stopColor="#2f4a72" />
          </linearGradient>
          <radialGradient id="outfieldFill" cx="50%" cy="95%" r="85%">
            <stop offset="0%" stopColor="#3f8f47" />
            <stop offset="100%" stopColor="#26622f" />
          </radialGradient>
          <linearGradient id="pitchFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c2ab7d" />
            <stop offset="100%" stopColor="#d9c79b" />
          </linearGradient>
          {/* The floodlight wash, so the ground reads as an evening match. */}
          <radialGradient id="lightFill" cx="50%" cy="10%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="400" height="300" fill="url(#skyFill)" />

        {/* ── Stands and crowd ──────────────────────────────────────────── */}
        <ellipse cx="200" cy="150" rx="330" ry="120" fill="#16233c" />
        <ellipse cx="200" cy="146" rx="318" ry="112" fill="#22334f" />

        <g className="stadium__crowd">
          {/*
            The crowd is thousands of small dots in tiered arcs. Individually
            meaningless, collectively the single thing that most separates a
            stadium from a field — and because they are elements rather than a
            texture, they can react.
          */}
          {[0, 1, 2, 3].map((row) =>
            Array.from({ length: 58 }, (_, i) => {
              const t = i / 57;
              const angle = Math.PI * (0.04 + t * 0.92);
              const rx = 300 - row * 22;
              const ry = 104 - row * 14;
              const x = 200 - Math.cos(angle) * rx;
              const y = 150 - Math.sin(angle) * ry;
              if (y > 118) return null;
              const hue = (i * 37 + row * 61) % 360;
              return (
                <circle
                  key={`${row}-${i}`}
                  className="stadium__fan"
                  cx={x}
                  cy={y}
                  r={1.5 - row * 0.15}
                  // Muted rather than fully saturated: a rainbow of pure hues
                  // reads as confetti, a crowd reads as thousands of muted
                  // clothes under floodlight.
                  fill={`hsl(${hue} 32% ${52 - row * 5}%)`}
                  style={{ animationDelay: `${((i * 7 + row * 13) % 20) * 60}ms` }}
                />
              );
            })
          )}
        </g>

        {/* Floodlight pylons. */}
        {[36, 364].map((x) => (
          <g key={x}>
            <rect x={x - 1.5} y="34" width="3" height="58" fill="#3d4a63" />
            <rect x={x - 13} y="22" width="26" height="14" rx="2" fill="#dfe6f2" />
          </g>
        ))}

        {/* ── The outfield ──────────────────────────────────────────────── */}
        <ellipse cx="200" cy="330" rx="290" ry="215" fill="url(#outfieldFill)" />
        {/* Mown stripes, in perspective: wider and further apart as they come
            towards the viewer. */}
        {Array.from({ length: 9 }, (_, i) => (
          <ellipse
            key={i}
            cx="200"
            cy="330"
            rx={290 - i * 30}
            ry={215 - i * 22}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.045"
            strokeWidth={7 + i}
          />
        ))}
        {/* The rope. */}
        <ellipse cx="200" cy="330" rx="286" ry="211" fill="none" stroke="#f2f6ff" strokeOpacity="0.5" strokeWidth="1.6" />
        {/* The 30-yard circle. */}
        <ellipse cx="200" cy="322" rx="168" ry="118" fill="none" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="1.2" strokeDasharray="6 5" />

        {/* ── The square and the pitch ──────────────────────────────────── */}
        <path d="M170 132 L230 132 L268 300 L132 300 Z" fill="#b9a273" opacity="0.55" />
        <path d="M182 134 L218 134 L246 300 L154 300 Z" fill="url(#pitchFill)" />
        {/* Creases. */}
        <path d="M176 150 L224 150" stroke="#fdfbf3" strokeWidth="1.2" opacity="0.9" />
        <path d="M160 258 L240 258" stroke="#fdfbf3" strokeWidth="1.8" opacity="0.9" />

        {/* Bowler's stumps at the far end. */}
        <g>
          {[195, 200, 205].map((x) => (
            <rect key={x} x={x - 0.8} y="138" width="1.6" height="11" rx="0.6" fill="#f4eddc" />
          ))}
        </g>

        <rect width="400" height="300" fill="url(#lightFill)" />
      </svg>

      {/* ── Fielders ─────────────────────────────────────────────────────── */}
      <div className="stadium__fielders" aria-hidden="true">
        {FIELD.map((f, i) => (
          <span
            key={i}
            className={`stadium__fielder${f.deep ? " stadium__fielder--deep" : ""}`}
            style={{
              /**
               * Two corrections over the naive placement, both learned by
               * looking at the rendered ground.
               *
               * The depth axis was inverted: y runs 0 at the far boundary to 1
               * at the batter, so a slip fielder (y 0.78) belongs LOW on the
               * screen, and the first version put him at 28% — standing in the
               * crowd. The grass runs from about 48% to 93%, and fielders are
               * mapped into exactly that band.
               *
               * And x converges with depth. The ground is drawn in
               * perspective, so the same distance square of the wicket covers
               * far fewer screen pixels at the far boundary than near the bat;
               * a flat x put deep fielders outside the rope.
               */
              left: `${(0.5 + (f.x + shift.x - 0.5) * (0.55 + (f.y + shift.y) * 1.05)) * 100}%`,
              top: `${48 + (f.y + shift.y) * 45}%`,
            }}
          >
            <Fielder />
          </span>
        ))}
      </div>

      {/* ── The bowler, running in ───────────────────────────────────────── */}
      <div className={`stadium__bowler${phase === "runup" ? " stadium__bowler--running" : ""}`} aria-hidden="true">
        <Bowler phase={phase === "travelling" ? 1 : 0} />
      </div>

      {/* ── The ball ─────────────────────────────────────────────────────── */}
      {(travelling || phase === "result") && (
        <div
          className="stadium__ball"
          aria-hidden="true"
          style={{
            /**
             * The ball must ARRIVE at the bat exactly when progress hits 1,
             * because that is the instant the timing maths calls perfect.
             *
             * It used to stop at 86% while the batter's hands are at ~91%, so
             * at the moment you were scored as "on the money" the ball still
             * looked short of the bat — and the natural correction is to wait,
             * which scores as late. The game felt inaccurate because it was:
             * what you saw and what you were judged on disagreed by about
             * five per cent of the pitch.
             */
            top: `${26 + ballY * 48}%`,
            transform: `translate(-50%, calc(-50% - ${bounceLift}%)) scale(${ballScale}) rotate(${ballSpin}deg)`,
            opacity: phase === "result" ? 0 : 1,
          }}
        />
      )}

      {/* ── The striker's stumps and the batter ──────────────────────────── */}
      <div className="stadium__stumps" aria-hidden="true">
        <Stumps broken={outcome === "out" && phase === "result"} />
      </div>

      <div className={`stadium__batter${running > 0 ? " stadium__batter--running" : ""}`} aria-hidden="true">
        {/* The bat swings through as the ball arrives, and stays through on
            the follow-up frame. Two poses is enough — the eye fills in the
            rest from the ball's own motion. */}
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

      {/* ── The umpire ───────────────────────────────────────────────────── */}
      <div className={`stadium__umpire${signal !== "none" ? " stadium__umpire--signalling" : ""}`} aria-hidden="true">
        <Umpire signal={signal} />
        {signal !== "none" && <span className="stadium__umpire-call">{UMPIRE_LABEL[signal]}</span>}
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
              opacity: 0.42 - i * 0.12,
            }}
          />
        ))}

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

      {/* ── Fullscreen ───────────────────────────────────────────────────── */}
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

      {/*
        The contact band, on the pitch where the shot is actually played.

        The flat-pitch version had one ("the shaded band is where a shot
        connects") and replacing it with the stadium silently dropped it. That
        is the regression behind "where to hit" — a beautiful ground with no
        indication of when to swing is worse to play than an ugly one with a
        stripe on it.
      */}
      <div
        className="stadium__zone"
        aria-hidden="true"
        style={{ opacity: 0.25 + nearness * 0.75, boxShadow: `0 0 ${8 + nearness * 34}px ${nearness * 12}px rgba(255, 214, 107, ${nearness * 0.85})` }}
      />

      {/* The meter. Drawn from the real scoring windows — see above. */}
      {(travelling || phase === "runup") && (
        <div className="stadium__meter" aria-hidden="true">
          <div className="stadium__meter-track">
            <span className="stadium__meter-band stadium__meter-band--edge" style={{ left: `${(contactAt - edge) * 100}%`, width: `${edge * 2 * 100}%` }} />
            <span className="stadium__meter-band stadium__meter-band--good" style={{ left: `${(contactAt - good) * 100}%`, width: `${good * 2 * 100}%` }} />
            <span className="stadium__meter-band stadium__meter-band--perfect" style={{ left: `${(contactAt - perfect) * 100}%`, width: `${perfect * 2 * 100}%` }} />
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

      {/* Where you are aiming, on the field itself rather than only in a
          button below it — the shot and the gap should be in one picture. */}
      {/* A corner chip, not a pill on the pitch. The previous version floated
          over the crease and the ball's flight path — the two things the eye
          must never be pulled away from. */}
      <div className="stadium__aim" aria-hidden="true">
        Aim <strong>{AIM_LABEL[aim]}</strong>
      </div>
    </div>
  );
}
