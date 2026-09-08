/**
 * The players, drawn.
 *
 * These replaced emoji. The old screen used 🏏 and 🏃 for the batter and the
 * bowler, and the feedback on it was exact: small, over-acted and funny. It is
 * a fair criticism and an unfixable one while they stay emoji — an emoji is
 * someone else's cartoon, rendered at whatever size and style the operating
 * system feels like, and three of them together never look like one scene.
 *
 * So every figure here is a drawn silhouette on a shared 40x60 grid, in the
 * same weight and proportion, lit from the same side. Silhouettes rather than
 * detailed characters, because at the size a phone shows them detail turns to
 * mud, and because a silhouette in a recognisable cricket POSTURE reads as a
 * cricketer instantly — the stance is what identifies a batter, not the face.
 */

/** Team colours, so the two sides are distinguishable at a glance. */
export const BATTING_KIT = "#f2f5fb";
export const FIELDING_KIT = "#2f6fd0";
export const UMPIRE_KIT = "#1c2534";
const SKIN = "#c98d5e";

/**
 * The batter, side-on in a proper stance.
 *
 * `swing` moves the bat through the shot. The back-lift and the follow-through
 * are the two frames that make a still figure read as batting.
 */
export function Batter({ swing = 0, kit = BATTING_KIT }: { swing?: number; kit?: string }) {
  // 0 = waiting with the bat up behind, 1 = fully through the shot.
  const batAngle = -40 + swing * 150;
  return (
    <svg viewBox="0 0 40 60" className="fig fig--batter" aria-hidden="true">
      {/* Back pad and front pad, the whitest thing on a cricket field. */}
      <path d="M17 40 L17 55 L22 55 L22 40 Z" fill="#eef2f8" stroke="#c3ccdb" strokeWidth="0.6" />
      <path d="M22 41 L24 55 L29 54 L26 40 Z" fill="#eef2f8" stroke="#c3ccdb" strokeWidth="0.6" />
      {/* Boots. */}
      <path d="M15 55 L23 55 L23 58 L14 58 Z" fill="#20293a" />
      <path d="M24 54 L30 53 L31 57 L24 58 Z" fill="#20293a" />
      {/* Torso, leaning forward into the ball. */}
      <path d="M18 22 Q16 32 17 41 L27 41 Q28 31 25 22 Z" fill={kit} stroke="#c3ccdb" strokeWidth="0.6" />
      {/* Head and helmet: the grille is the detail that says cricket. */}
      <circle cx="22" cy="17" r="5.2" fill={SKIN} />
      <path d="M16.8 17 A5.2 5.2 0 0 1 27.2 17 L27.2 15 Q22 11.5 16.8 15 Z" fill="#20293a" />
      <path d="M26.6 16.5 Q29.5 18.5 26.6 20.5" fill="none" stroke="#8d97a8" strokeWidth="0.9" />
      {/* Arms and the bat, rotating about the hands. */}
      <g transform={`rotate(${batAngle} 24 27)`}>
        <path d="M22 25 L27 26 L27 29 L22 28 Z" fill={SKIN} />
        {/* Blade and handle. */}
        <rect x="26" y="26.4" width="4" height="2.2" rx="0.6" fill="#3a2a18" />
        <path d="M30 25.2 L38 24.4 L38 30.6 L30 29.8 Z" fill="#d8b57c" stroke="#a8875a" strokeWidth="0.5" />
      </g>
      {/* Gloves. */}
      <circle cx="24" cy="27" r="2.4" fill="#eef2f8" stroke="#c3ccdb" strokeWidth="0.5" />
    </svg>
  );
}

/**
 * The bowler, mid run-up or in delivery stride.
 *
 * `phase` 0 is jogging in, 1 is the front foot landing with the arm coming
 * over. Two poses is enough: the eye fills in the rest from the motion of the
 * element across the screen.
 */
export function Bowler({ phase = 0, kit = FIELDING_KIT }: { phase?: number; kit?: string }) {
  const armAngle = -150 + phase * 200;
  const stride = phase * 6;
  return (
    <svg viewBox="0 0 40 60" className="fig fig--bowler" aria-hidden="true">
      {/* Legs, striding. */}
      <path d={`M18 40 L${16 - stride * 0.4} 57 L20 58 L22 42 Z`} fill="#20293a" />
      <path d={`M22 40 L${26 + stride} 55 L30 57 L26 41 Z`} fill="#20293a" />
      <path d="M20 22 Q18 32 19 41 L26 41 Q27 31 25 22 Z" fill={kit} />
      <circle cx="22" cy="17" r="4.8" fill={SKIN} />
      <path d="M17.4 16 Q22 12 26.6 16 Z" fill="#1a1a1a" />
      {/* The bowling arm, coming over the top. */}
      <g transform={`rotate(${armAngle} 23 25)`}>
        <path d="M21.5 23.5 L23 12 L26 12.6 L24.5 24.5 Z" fill={kit} />
        <circle cx="24.4" cy="12" r="2.3" fill="#c1362f" />
      </g>
      {/* The non-bowling arm, out for balance. */}
      <path d="M20 24 L13 30 L15 32 L21 27 Z" fill={kit} />
    </svg>
  );
}

/**
 * A fielder. Small, and deliberately plainer than the two principals so the
 * eye is not dragged around the ground by ten identical figures.
 */
export function Fielder({ kit = FIELDING_KIT }: { kit?: string }) {
  return (
    <svg viewBox="0 0 40 60" className="fig fig--fielder" aria-hidden="true">
      <path d="M17 40 L16 57 L20 57 L21 42 Z" fill="#20293a" />
      <path d="M23 40 L25 57 L29 57 L26 42 Z" fill="#20293a" />
      <path d="M19 23 Q17 33 18 41 L27 41 Q28 32 26 23 Z" fill={kit} />
      {/* Arms slightly out, the way a fielder waits. */}
      <path d="M19 25 L13 34 L15.5 35 L21 27 Z" fill={kit} />
      <path d="M26 25 L32 34 L29.5 35 L24 27 Z" fill={kit} />
      <circle cx="22.5" cy="18" r="4.6" fill={SKIN} />
      <path d="M18 17.5 Q22.5 13 27 17.5 Z" fill="#1a1a1a" />
    </svg>
  );
}

/**
 * The umpire, whose whole job on screen is the signal.
 *
 * The signals are the real ones and they are worth getting right, because they
 * are the most widely recognised gestures in the sport: one finger raised for
 * out, both arms above the head for six, an arm swept across the body for
 * four. Anyone who watches cricket reads these before they read the text.
 */
export function Umpire({ signal }: { signal: "none" | "out" | "four" | "six" | "wide-arms" }) {
  return (
    <svg viewBox="0 0 40 60" className={`fig fig--umpire fig--umpire-${signal}`} aria-hidden="true">
      <path d="M17 40 L16 57 L20 57 L21 42 Z" fill="#39424f" />
      <path d="M23 40 L25 57 L29 57 L26 42 Z" fill="#39424f" />
      {/* The wide-brimmed white hat and dark coat. */}
      <path d="M19 23 Q17 33 18 41 L27 41 Q28 32 26 23 Z" fill={UMPIRE_KIT} />
      <circle cx="22.5" cy="18" r="4.6" fill={SKIN} />
      <ellipse cx="22.5" cy="14.5" rx="8" ry="1.8" fill="#f1f4f9" />
      <path d="M18.4 14.5 A4.1 4.1 0 0 1 26.6 14.5 Z" fill="#f1f4f9" />

      {signal === "out" && (
        // One finger raised. The most consequential gesture in the game.
        <g>
          <path d="M25 25 L27 10 L30 10.6 L28 26 Z" fill={UMPIRE_KIT} />
          <circle cx="28.5" cy="9" r="2" fill={SKIN} />
          <path d="M19 25 L13 33 L15.5 34 L21 27 Z" fill={UMPIRE_KIT} />
        </g>
      )}
      {signal === "six" && (
        // Both arms straight above the head.
        <g>
          <path d="M25 25 L28 8 L31 8.6 L28 26 Z" fill={UMPIRE_KIT} />
          <path d="M20 25 L17 8 L14 8.6 L17 26 Z" fill={UMPIRE_KIT} />
          <circle cx="29.5" cy="7" r="2" fill={SKIN} />
          <circle cx="15.5" cy="7" r="2" fill={SKIN} />
        </g>
      )}
      {signal === "four" && (
        // One arm swept across the chest.
        <g>
          <path d="M25 25 L10 21 L10.6 24 L25 28 Z" fill={UMPIRE_KIT} />
          <circle cx="9.5" cy="22.5" r="2" fill={SKIN} />
          <path d="M26 25 L31 33 L28.5 34 L24 27 Z" fill={UMPIRE_KIT} />
        </g>
      )}
      {(signal === "none" || signal === "wide-arms") && (
        <g>
          {signal === "wide-arms" ? (
            <>
              <path d="M25 25 L38 23 L38 26 L25 28 Z" fill={UMPIRE_KIT} />
              <path d="M20 25 L7 23 L7 26 L20 28 Z" fill={UMPIRE_KIT} />
            </>
          ) : (
            <>
              {/* Hands behind the back, which is how an umpire actually stands. */}
              <path d="M19 25 L15 34 L17.5 35 L21 27 Z" fill={UMPIRE_KIT} />
              <path d="M26 25 L30 34 L27.5 35 L24 27 Z" fill={UMPIRE_KIT} />
            </>
          )}
        </g>
      )}
    </svg>
  );
}

/** Three stumps and two bails. */
export function Stumps({ broken = false }: { broken?: boolean }) {
  return (
    <svg viewBox="0 0 40 60" className="fig fig--stumps" aria-hidden="true">
      {[15, 20, 25].map((x, i) => (
        <rect
          key={x}
          x={x - 1.3}
          y={broken ? 24 + i * 2 : 24}
          width="2.6"
          height="26"
          rx="1"
          fill="#f4eddc"
          stroke="#c9bb9a"
          strokeWidth="0.4"
          transform={broken ? `rotate(${(i - 1) * 14} ${x} 50)` : undefined}
        />
      ))}
      {/* Bails: on top when the stumps are standing, in the air when they are
          not. The flying bail is the image every cricket fan has of a bowled. */}
      {broken ? (
        <>
          <rect x="27" y="12" width="6" height="1.8" rx="0.9" fill="#f4eddc" transform="rotate(38 30 13)" />
          <rect x="6" y="16" width="6" height="1.8" rx="0.9" fill="#f4eddc" transform="rotate(-24 9 17)" />
        </>
      ) : (
        <>
          <rect x="14.4" y="22.4" width="5.6" height="1.6" rx="0.8" fill="#f4eddc" />
          <rect x="19.8" y="22.4" width="5.6" height="1.6" rx="0.8" fill="#f4eddc" />
        </>
      )}
    </svg>
  );
}
