/**
 * The players, drawn.
 *
 * These replaced emoji, and then they were redrawn again. The first pass fixed
 * the obvious problem (an emoji is someone else's cartoon, rendered at whatever
 * size and style the operating system feels like, and three of them together
 * never look like one scene). It left a subtler one behind: the heads were a
 * quarter of the body height, which is chibi proportion. That single ratio is
 * most of what separates "cartoon" from "athlete" at a glance, far more than
 * detail does.
 *
 * So everything here is built on one figure canon: a 40x60 grid, soles on the
 * ground line at y=58, and a head about one seventh of standing height. The
 * landmarks are the ones life drawing uses — shoulders at 1.5 heads, hips at
 * half height, knees at 5.4 heads — because a silhouette that hits those reads
 * as a person even at thirty pixels tall, and one that misses them reads as a
 * toy at any size.
 *
 * Silhouettes rather than characters, still, and for the same reason: at the
 * size a phone shows these, detail turns to mud, and the POSTURE is what
 * identifies a cricketer. Nobody recognises a batter by his face.
 *
 * Everything is lit from above and slightly left, which is where the ground's
 * near floodlight is, so the figures and the scene agree about the time of day.
 */

/** Team colours, so the two sides are distinguishable at a glance. */
export const BATTING_KIT = "#eef3fb";
export const FIELDING_KIT = "#2b5fa8";
export const UMPIRE_KIT = "#141b28";

const SKIN = "#b87c4e";
const SKIN_SHADE = "#93603a";
/** Trousers, boots and everything else that sits in shadow. */
const DARK = "#161e2c";
const DARKER = "#0d131e";

/** The shaded side of a kit colour, so a figure has a light side and a dark one. */
function shade(hex: string): string {
  // Cheap and predictable: mix a quarter of the way to black.
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.72);
  const g = Math.round(((n >> 8) & 255) * 0.72);
  const b = Math.round((n & 255) * 0.72);
  return `rgb(${r} ${g} ${b})`;
}

/**
 * The batter, seen from behind — which is the only correct view from this
 * camera, and the one the old side-on drawing got wrong.
 *
 * The camera sits behind the keeper looking down the pitch, so a right-hander
 * has his back to us, turned three quarters with the off side to screen right.
 * That is worth drawing properly rather than reusing a profile: from behind you
 * read the shoulders turning into the shot, which is the whole body language of
 * batting.
 *
 * `swing` runs the bat from the backlift through the line of the ball. The two
 * frames that make a still figure read as batting are the raised bat and the
 * blade crossing the ball's line, and the eye fills in everything between them
 * from the ball's own motion.
 */
export function Batter({ swing = 0, kit = BATTING_KIT }: { swing?: number; kit?: string }) {
  /*
    Rest is the backlift, not a bat on the ground, because the bat spends most
    of each delivery up and only the last fraction of a second coming down.
    Swinging to screen right takes the blade across the ball's line, which
    arrives down the middle of the pitch to the batter's off side.
  */
  const batAngle = -35 + swing * 155;
  const kitDark = shade(kit);
  // The whole body turns a few degrees into the shot. Small, but it is the
  // difference between a figure holding a bat and a figure playing a shot.
  const turn = swing * 7;

  return (
    <svg viewBox="0 0 40 60" className="fig fig--batter" aria-hidden="true">
      <g transform={`rotate(${turn} 21 40)`}>
        {/* Front pad: further from us, so it is the darker of the two. */}
        <path d="M17.6 31.8 L15.2 43.6 L14 54.2 L18.7 54.4 L19.9 43.6 L21.4 31.8 Z" fill="#d8e0ec" />
        <path d="M17.6 31.8 L16.5 37.6 L20.6 37.6 L21.4 31.8 Z" fill="#c3cede" />
        <path d="M13.4 53.6 L19.3 53.8 L19.8 57.4 L12.9 57.2 Z" fill={DARKER} />

        {/* Back pad: nearer, brighter, and the one that gets hit. */}
        <path d="M22.3 31.4 L21.6 43.8 L22.2 54.6 L27.5 54.6 L27.7 43.8 L26.9 31.4 Z" fill="#f1f5fb" />
        <path d="M22.3 31.4 L22 37.4 L27.1 37.4 L26.9 31.4 Z" fill="#dde5ef" />
        {/* Strap shadows: three across each pad, which is what makes a white
            box read as a cricket pad rather than a plank. */}
        <path d="M21.8 40.2 h6 v0.9 h-6 z M21.7 46.4 h6.1 v0.9 h-6.1 z" fill="#c7d2e0" />
        <path d="M21.7 54 L28 54 L28.6 57.6 L21.5 57.6 Z" fill={DARKER} />

        {/* Trousers between hip and pad. */}
        <path d="M17.1 26.6 L26.8 26.6 L27.4 33 L16.6 33 Z" fill={kit} />
        <path d="M21.6 26.6 L22.1 33 L16.6 33 L17.1 26.6 Z" fill={kitDark} />

        {/* Shirt, from behind, shoulders turning. */}
        <path
          d="M15.7 21.4 Q16.6 19 20.6 18.5 Q24.9 18.9 25.9 21.2 L27 28.6 Q21.4 30.6 16.5 28.6 Z"
          fill={kit}
        />
        {/* The shaded half. A single split down the back does more for form
            than any amount of drawn detail. */}
        <path d="M15.7 21.4 Q16.6 19 20.6 18.5 L20.9 29.9 Q18.3 29.7 16.5 28.6 Z" fill={kitDark} />
        {/* Shoulder yoke, in the fielding side's opposite tone so the two teams
            never read as the same. */}
        <path d="M16.1 20.4 Q20.6 18.2 25.5 20.3 L25.9 22 Q20.6 19.9 15.8 22.1 Z" fill="#8fa6c6" />

        {/* Far arm. */}
        <path d="M16.7 21.7 L15.9 26.9 L21.2 30.8 L22.5 29.1 L18.4 25.9 L19 22 Z" fill={kitDark} />
        {/* Near arm. */}
        <path d="M24.7 21.3 L26.3 26.5 L24.5 30.4 L22.8 29.5 L24.3 26.3 L22.9 21.7 Z" fill={kit} />

        {/* Neck and helmet, seen from behind and turned to watch the ball. */}
        <path d="M19.5 16.6 h2.9 v3.1 h-2.9 z" fill={SKIN_SHADE} />
        <path d="M17 15.9 A3.9 3.9 0 0 0 24.6 15.9 L24.6 18.6 Q20.8 20.2 17 18.6 Z" fill="#1d283c" />
        <circle cx="20.8" cy="14.3" r="3.95" fill="#232f47" />
        <ellipse cx="19.5" cy="12.2" rx="2.7" ry="1.5" transform="rotate(-20 19.5 12.2)" fill="#2e3d59" />
        {/* A sliver of the grille, catching the light on the turned side. It is
            a two-pixel detail that says "cricket helmet" and nothing else does. */}
        <path d="M23.9 12.7 Q26.6 14.6 24.3 17.4" fill="none" stroke="#93a5c1" strokeWidth="0.75" strokeLinecap="round" />
        <path d="M24.5 14.9 L25.9 15.1" stroke="#93a5c1" strokeWidth="0.55" strokeLinecap="round" />

        {/* Gloves and bat, swinging about the hands. */}
        <g transform={`rotate(${batAngle} 23.1 30.2)`}>
          {/* Blade: a real bat is a wedge, thin at the toe and swollen at the
              back of the middle, and the highlight down one edge is the only
              thing that makes willow read as willow. */}
          <path d="M20.9 25.6 L25.3 25.6 L25.6 12.9 Q23.1 11.6 20.6 12.9 Z" fill="#d9bb85" />
          <path d="M24.1 25.6 L25.3 25.6 L25.6 12.9 Q24.7 12.4 24 12.5 Z" fill="#bb9a64" />
          <path d="M21.6 24.6 L21.6 14.2" stroke="#c4a575" strokeWidth="0.4" opacity="0.8" />
          {/* Splice and handle. */}
          <path d="M21.9 26 L24.3 26 L24.3 25 L21.9 25 Z" fill="#7a5c33" />
          <path d="M22.1 30.9 L24.1 30.9 L24.3 25.4 L21.9 25.4 Z" fill="#2b2119" />
          <path d="M22.1 27.2 h2.1 v0.5 h-2.1 z M22.1 28.6 h2.1 v0.5 h-2.1 z" fill="#4a3a26" />
          {/* Gloves. */}
          <circle cx="22.4" cy="29.6" r="1.75" fill="#f3f6fb" />
          <circle cx="24" cy="31" r="1.75" fill="#e2e8f2" />
        </g>
      </g>
    </svg>
  );
}

/**
 * The bowler, running in and delivering.
 *
 * Seen from the front, because from this camera he runs towards us. `phase` 0
 * is the approach, 1 is the front foot landing with the arm coming over.
 */
export function Bowler({ phase = 0, kit = FIELDING_KIT }: { phase?: number; kit?: string }) {
  const armAngle = -158 + phase * 206;
  const stride = phase * 5;
  const kitDark = shade(kit);
  // The body leans into the delivery stride and straightens on the follow
  // through; without the lean the figure looks like it is standing still with
  // one arm going round.
  const lean = phase * 9;

  return (
    <svg viewBox="0 0 40 60" className="fig fig--bowler" aria-hidden="true">
      <g transform={`rotate(${-lean} 20 52)`}>
        {/* Back leg, driving through. */}
        <path
          d={`M21.4 33 L${23.4 + stride} 45 L${24.6 + stride * 1.2} 55.4 L${21.4 + stride * 1.2} 56 L${20.6 + stride * 0.6} 45.4 L19.2 33 Z`}
          fill={DARK}
        />
        {/* Front leg, braced. */}
        <path
          d={`M17.8 33 L${16.4 - stride * 0.5} 45 L${15.4 - stride * 0.8} 55.8 L${18.6 - stride * 0.5} 56.2 L${19.4 - stride * 0.3} 45.4 L20.8 33 Z`}
          fill="#1d2739"
        />
        <path d={`M${14.8 - stride * 0.8} 55.4 h5 l0.4 2.8 h-5.8 z`} fill={DARKER} />
        <path d={`M${20.9 + stride * 1.2} 55.2 h4.8 l0.5 2.8 h-5.6 z`} fill={DARKER} />

        {/* Hips and shirt. */}
        <path d="M17.2 27.4 h6.4 l0.6 6.2 h-7.6 z" fill={kit} />
        <path d="M16.1 20.6 Q17 18.6 20.2 18.2 Q23.4 18.6 24.3 20.6 L25 28.4 L15.4 28.4 Z" fill={kit} />
        <path d="M16.1 20.6 Q17 18.6 20.2 18.2 L20.2 28.4 L15.4 28.4 Z" fill={kitDark} />

        {/* Non-bowling arm, out across the body for balance. */}
        <path d="M16.3 20.8 L12.2 25.8 L10.9 29.4 L12.8 30.1 L14.2 26.6 L18 22.4 Z" fill={kitDark} />
        <circle cx="11.9" cy="30.2" r="1.3" fill={SKIN_SHADE} />

        {/* Head, and the peak of a cap. */}
        <path d="M19 15.4 h2.6 v3 H19 z" fill={SKIN_SHADE} />
        <circle cx="20.3" cy="12.6" r="3.1" fill={SKIN} />
        <path d="M17.2 12.3 A3.1 3.1 0 0 1 23.4 12.3 L23.4 11.6 Q20.3 8.9 17.2 11.6 Z" fill="#1a2233" />
        <path d="M16.9 12.1 h6.8 l0.4 1 h-7.6 z" fill="#141b29" />

        {/* The bowling arm, coming over the top with the ball in the hand. */}
        <g transform={`rotate(${armAngle} 23.2 22.4)`}>
          <path d="M21.9 22.6 L22.6 11.4 L25.4 11.6 L24.7 23 Z" fill={kit} />
          <circle cx="24" cy="10.4" r="1.4" fill={SKIN} />
          <circle cx="24.1" cy="8.6" r="1.65" fill="#b4271b" />
          <path d="M22.7 8.5 h2.8" stroke="#f1e8d6" strokeWidth="0.45" />
        </g>
      </g>
    </svg>
  );
}

/**
 * A fielder, waiting on the balls of his feet.
 *
 * Deliberately plainer than the two principals so the eye is not dragged around
 * the ground by ten identical figures, but built on the same canon so it does
 * not look like it wandered in from a different game.
 */
export function Fielder({ kit = FIELDING_KIT }: { kit?: string }) {
  const kitDark = shade(kit);
  return (
    <svg viewBox="0 0 40 60" className="fig fig--fielder" aria-hidden="true">
      {/* Legs, slightly apart and slightly bent, which is a ready stance. */}
      <path d="M18.4 33.2 L16.9 45.6 L16.2 56 L19.3 56 L20 45.6 L20.7 33.2 Z" fill={DARK} />
      <path d="M21.2 33.2 L22.5 45.6 L23.7 56 L20.6 56 L20.2 45.6 L19.5 33.2 Z" fill="#1d2739" />
      <path d="M15.5 55.4 h4.2 l0.3 2.7 h-5 z" fill={DARKER} />
      <path d="M20.4 55.4 h4 l0.5 2.7 h-5 z" fill={DARKER} />

      {/* Hips. */}
      <path d="M17.4 28 h5.6 l0.5 5.8 h-6.6 z" fill={kitDark} />

      {/* Shirt. */}
      <path d="M16.2 20.8 Q17 18.8 20.2 18.4 Q23.4 18.8 24.2 20.8 L24.8 29 L15.6 29 Z" fill={kit} />
      <path d="M16.2 20.8 Q17 18.8 20.2 18.4 L20.2 29 L15.6 29 Z" fill={kitDark} />

      {/* Arms, hands resting on the knees the way a fielder actually waits. */}
      <path d="M16.3 21 L13.9 27.4 L12.9 32.4 L14.8 32.8 L15.9 28 L18 22.2 Z" fill={kitDark} />
      <path d="M24.1 21 L26.5 27.4 L27.5 32.4 L25.6 32.8 L24.5 28 L22.4 22.2 Z" fill={kit} />
      <circle cx="13.8" cy="33.2" r="1.2" fill={SKIN_SHADE} />
      <circle cx="26.6" cy="33.2" r="1.2" fill={SKIN} />

      {/* Head and cap. */}
      <path d="M19 15.6 h2.4 v3 H19 z" fill={SKIN_SHADE} />
      <circle cx="20.2" cy="12.8" r="3" fill={SKIN} />
      <path d="M17.2 12.5 A3 3 0 0 1 23.2 12.5 L23.2 11.8 Q20.2 9.2 17.2 11.8 Z" fill="#1a2233" />
      <path d="M16.9 12.3 h6.6 l0.4 1 h-7.4 z" fill="#141b29" />
    </svg>
  );
}

/**
 * The umpire, whose whole job on screen is the signal.
 *
 * The signals are the real ones and they are worth getting right, because they
 * are the most widely recognised gestures in the sport: one finger raised for
 * out, both arms above the head for six, an arm swept across the body for four.
 * Anyone who watches cricket reads these before they read the text.
 */
export function Umpire({ signal }: { signal: "none" | "out" | "four" | "six" | "wide-arms" }) {
  const coat = UMPIRE_KIT;
  const coatDark = "#0d131e";
  return (
    <svg viewBox="0 0 40 60" className={`fig fig--umpire fig--umpire-${signal}`} aria-hidden="true">
      <path d="M18.4 33.2 L17.1 45.6 L16.4 56 L19.4 56 L20 45.6 L20.7 33.2 Z" fill="#2b3446" />
      <path d="M21.2 33.2 L22.4 45.6 L23.6 56 L20.6 56 L20.2 45.6 L19.5 33.2 Z" fill="#222b3b" />
      <path d="M15.7 55.4 h4.1 l0.3 2.7 h-4.9 z" fill={DARKER} />
      <path d="M20.5 55.4 h4 l0.4 2.7 h-4.9 z" fill={DARKER} />

      {/* The coat, longer than a playing shirt, which is how you tell at a
          glance that this figure is not a fielder. */}
      <path d="M16 20.8 Q17 18.7 20.2 18.3 Q23.4 18.7 24.4 20.8 L25.4 34.4 L15 34.4 Z" fill={coat} />
      <path d="M16 20.8 Q17 18.7 20.2 18.3 L20.2 34.4 L15 34.4 Z" fill={coatDark} />

      {/* Head, and the wide-brimmed white hat. */}
      <path d="M19 15.4 h2.4 v3 H19 z" fill={SKIN_SHADE} />
      <circle cx="20.2" cy="12.6" r="3" fill={SKIN} />
      <ellipse cx="20.2" cy="11.4" rx="5.6" ry="1.5" fill="#eef2f8" />
      <path d="M17.3 11.4 A2.9 2.9 0 0 1 23.1 11.4 Z" fill="#e2e8f1" />

      {signal === "out" && (
        // One finger raised. The most consequential gesture in the game.
        <g>
          <path d="M23.8 22 L25.6 8.4 L28.2 8.9 L26.4 22.6 Z" fill={coat} />
          <circle cx="27" cy="7.4" r="1.5" fill={SKIN} />
          <path d="M26.6 4.6 h1 v3 h-1 z" fill={SKIN} />
          <path d="M16.6 21.6 L13.2 28.4 L15.1 29.2 L18.4 22.6 Z" fill={coatDark} />
        </g>
      )}
      {signal === "six" && (
        <g>
          <path d="M23.8 22 L26.4 6.6 L29 7.1 L26.4 22.6 Z" fill={coat} />
          <path d="M16.6 22 L14 6.6 L11.4 7.1 L14 22.6 Z" fill={coatDark} />
          <circle cx="27.8" cy="5.6" r="1.5" fill={SKIN} />
          <circle cx="12.6" cy="5.6" r="1.5" fill={SKIN_SHADE} />
        </g>
      )}
      {signal === "four" && (
        <g>
          <path d="M23.8 21.6 L9.4 18.4 L8.9 21.2 L23.4 24.4 Z" fill={coat} />
          <circle cx="8.2" cy="19.8" r="1.5" fill={SKIN} />
          <path d="M24.4 22 L27.6 28.6 L25.7 29.4 L22.6 22.8 Z" fill={coat} />
        </g>
      )}
      {signal === "wide-arms" && (
        <g>
          <path d="M23.8 21.2 L36.6 19.6 L36.8 22.4 L23.9 24 Z" fill={coat} />
          <path d="M16.6 21.2 L3.8 19.6 L3.6 22.4 L16.5 24 Z" fill={coatDark} />
          <circle cx="37" cy="21" r="1.4" fill={SKIN} />
          <circle cx="3.2" cy="21" r="1.4" fill={SKIN_SHADE} />
        </g>
      )}
      {signal === "none" && (
        <g>
          {/* Hands behind the back, which is how an umpire actually stands. */}
          <path d="M16.6 21.4 L14.6 28.6 L16.5 29.2 L18.4 22.2 Z" fill={coatDark} />
          <path d="M23.8 21.4 L25.8 28.6 L23.9 29.2 L22 22.2 Z" fill={coat} />
        </g>
      )}
    </svg>
  );
}

/** Three stumps and two bails. */
export function Stumps({ broken = false }: { broken?: boolean }) {
  return (
    <svg viewBox="0 0 40 60" className="fig fig--stumps" aria-hidden="true">
      <defs>
        <linearGradient id="stumpWood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#bfae8c" />
          <stop offset="38%" stopColor="#f7f0dd" />
          <stop offset="100%" stopColor="#c6b491" />
        </linearGradient>
      </defs>
      {[15, 20, 25].map((x, i) => (
        <rect
          key={x}
          x={x - 1.35}
          y={broken ? 24 + i * 2 : 24}
          width="2.7"
          height="26"
          rx="1.2"
          fill="url(#stumpWood)"
          transform={broken ? `rotate(${(i - 1) * 14} ${x} 50)` : undefined}
        />
      ))}
      {/* Bails: on top when the stumps are standing, in the air when they are
          not. The flying bail is the image every cricket fan has of a bowled. */}
      {broken ? (
        <>
          <rect x="27" y="12" width="6" height="1.8" rx="0.9" fill="#f7f0dd" transform="rotate(38 30 13)" />
          <rect x="6" y="16" width="6" height="1.8" rx="0.9" fill="#f7f0dd" transform="rotate(-24 9 17)" />
        </>
      ) : (
        <>
          <rect x="14.4" y="22.4" width="5.6" height="1.6" rx="0.8" fill="#f7f0dd" />
          <rect x="19.8" y="22.4" width="5.6" height="1.6" rx="0.8" fill="#efe6cf" />
        </>
      )}
    </svg>
  );
}
