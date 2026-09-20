import { useEffect, useRef, useState } from "react";
import {
  BALL_RADIUS,
  STUMP_HALF,
  STUMP_HEIGHT,
  type ReviewOutcome,
  type ReviewResult,
  type Trajectory,
} from "./drs";
import "./DrsReview.css";

/**
 * The review, played out.
 *
 * Everything drawn here is read straight off the Trajectory that was
 * computed when the ball was bowled. The pitching mark is at the metre it
 * bounced, the impact mark is where it struck the pad, and the ball drawn
 * against the stumps at the end is at the height and line the physics says
 * it would have arrived at. Nothing on screen is chosen for effect.
 *
 * That is worth the discipline. The moment a replay shows a ball crashing
 * into middle stump while the verdict reads NOT OUT, the player stops
 * believing any of it - and once they stop believing it, the reviews
 * remaining counter is just a number going down.
 *
 * Drawn as SVG rather than canvas or a 3D library: it is a handful of
 * primitives at two fixed camera angles, it stays sharp at any size, it
 * needs no new dependency, and it costs the page nothing when no review is
 * happening.
 */

interface Props {
  trajectory: Trajectory;
  result: ReviewResult;
  outcome: ReviewOutcome;
  onFieldDecision: "out" | "not-out";
  onComplete: () => void;
}

/*
  The sequence. Broadcast reviews work because they withhold: the three
  tests arrive one at a time, and each one can end it. Resolving all of it
  at once would throw away the only tension the feature has.
*/
type Stage = "requested" | "tracking" | "pitching" | "impact" | "wickets" | "verdict";

const STAGE_MS: Record<Stage, number> = {
  requested: 1100,
  tracking: 1900,
  pitching: 1100,
  impact: 1100,
  wickets: 1700,
  verdict: 2600,
};

const ORDER: Stage[] = ["requested", "tracking", "pitching", "impact", "wickets", "verdict"];

/* ---- side view: distance down the pitch against height ---- */
const SIDE_W = 640;
const SIDE_H = 220;
const SIDE_PAD = 26;
/** Metres of pitch shown, from behind the stumps to well back of a bouncer's length. */
const Z_FROM = -0.6;
const Z_TO = 11.6;
/**
 * Height is drawn on a much larger scale than distance. Twelve metres of
 * pitch against 0.7m of stump would otherwise render as a flat line with a
 * dot on it. Every broadcast graphic exaggerates the vertical for the same
 * reason; the numbers underneath are untouched.
 */
const Y_TO = 1.25;

const sideX = (z: number) => SIDE_PAD + ((Z_TO - z) / (Z_TO - Z_FROM)) * (SIDE_W - SIDE_PAD * 2);
const sideY = (y: number) => SIDE_H - SIDE_PAD - (y / Y_TO) * (SIDE_H - SIDE_PAD * 2);

/* ---- front view: line against height, looking back down the pitch ---- */
const FRONT_W = 300;
const FRONT_H = 260;
const X_SPAN = 0.62;
const FRONT_Y_TO = 1.05;

const frontX = (x: number) => FRONT_W / 2 + (x / X_SPAN) * (FRONT_W / 2);
const frontY = (y: number) => FRONT_H - 34 - (y / FRONT_Y_TO) * (FRONT_H - 60);

function verdictTone(v: string): "out" | "notout" | "call" {
  if (v === "outside-leg" || v === "outside-off" || v === "missing" || v === "not-out") return "notout";
  if (v === "clipping" || v === "umpires-call") return "call";
  return "out";
}

const PITCHING_LABEL: Record<string, string> = {
  "in-line": "IN LINE",
  "outside-off": "OUTSIDE OFF",
  "outside-leg": "OUTSIDE LEG",
};
const IMPACT_LABEL: Record<string, string> = { "in-line": "IN LINE", "outside-off": "OUTSIDE OFF" };
const WICKETS_LABEL: Record<string, string> = {
  hitting: "HITTING",
  clipping: "CLIPPING",
  missing: "MISSING",
};

export function DrsReview({ trajectory: t, result, outcome, onFieldDecision, onComplete }: Props) {
  const [stage, setStage] = useState<Stage>("requested");
  const doneRef = useRef(false);

  useEffect(() => {
    const timers: number[] = [];
    let elapsed = 0;
    ORDER.forEach((s, i) => {
      if (i === 0) return;
      elapsed += STAGE_MS[ORDER[i - 1]!];
      timers.push(window.setTimeout(() => setStage(s), elapsed));
    });
    timers.push(
      window.setTimeout(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        onComplete();
      }, elapsed + STAGE_MS.verdict)
    );
    return () => timers.forEach(window.clearTimeout);
  }, [onComplete]);

  const reached = (s: Stage) => ORDER.indexOf(stage) >= ORDER.indexOf(s);
  const showSide = stage === "tracking" || stage === "pitching" || stage === "impact";
  const showFront = reached("wickets");

  return (
    <div className="drs" role="dialog" aria-live="polite" aria-label="Decision review">
      <div className="drs__panel">
        <header className="drs__head">
          <span className="drs__mark">DRS</span>
          <span className="drs__headtext">DECISION REVIEW SYSTEM</span>
          <span className="drs__onfield">
            ON FIELD: <strong>{onFieldDecision === "out" ? "OUT" : "NOT OUT"}</strong>
          </span>
        </header>

        {stage === "requested" && (
          <div className="drs__requested">
            <p className="drs__requested-top">REVIEW REQUESTED</p>
            <p className="drs__requested-sub">Review in progress…</p>
          </div>
        )}

        {showSide && (
          <div className="drs__stage">
            <svg viewBox={`0 0 ${SIDE_W} ${SIDE_H}`} className="drs__svg" role="img" aria-label="Ball tracking, side on">
              {/* ground */}
              <line x1={0} y1={sideY(0)} x2={SIDE_W} y2={sideY(0)} className="drs__ground" />

              {/* length markers, so "it pitched full" is something you can see */}
              {[2, 4, 6, 8, 10].map((m) => (
                <g key={m}>
                  <line x1={sideX(m)} y1={sideY(0)} x2={sideX(m)} y2={sideY(0) + 7} className="drs__tick" />
                  <text x={sideX(m)} y={sideY(0) + 19} className="drs__ticklabel" textAnchor="middle">
                    {m}m
                  </text>
                </g>
              ))}

              {/* stumps, side on */}
              <rect
                x={sideX(0) - 2}
                y={sideY(STUMP_HEIGHT)}
                width={4}
                height={sideY(0) - sideY(STUMP_HEIGHT)}
                className="drs__stump"
              />

              {/* flight: bowler's hand to the bounce, then on to the pad */}
              <path
                className={`drs__path${reached("tracking") ? " is-live" : ""}`}
                d={`M ${sideX(Z_TO)} ${sideY(1.9)} Q ${sideX(t.pitch.z + 2.4)} ${sideY(0.72)} ${sideX(t.pitch.z)} ${sideY(0)}`}
              />
              <path
                className={`drs__path drs__path--after${reached("tracking") ? " is-live" : ""}`}
                d={`M ${sideX(t.pitch.z)} ${sideY(0)} L ${sideX(t.impact.z)} ${sideY(t.impact.y)}`}
              />
              {/* predicted continuation to the stumps, dashed because it never happened */}
              <path
                className={`drs__predicted${reached("wickets") ? " is-live" : ""}`}
                d={`M ${sideX(t.impact.z)} ${sideY(t.impact.y)} L ${sideX(0)} ${sideY(t.stumps.y)}`}
              />

              {reached("pitching") && (
                <g className="drs__mark-in">
                  <ellipse cx={sideX(t.pitch.z)} cy={sideY(0)} rx={9} ry={3.5} className="drs__pitchmark" />
                  <text x={sideX(t.pitch.z)} y={sideY(0) - 14} className="drs__marklabel" textAnchor="middle">
                    PITCHED {t.pitch.z.toFixed(1)}m
                  </text>
                </g>
              )}

              {reached("impact") && (
                <g className="drs__mark-in">
                  <circle cx={sideX(t.impact.z)} cy={sideY(t.impact.y)} r={6} className="drs__impactmark" />
                  <text
                    x={sideX(t.impact.z) - 10}
                    y={sideY(t.impact.y) - 12}
                    className="drs__marklabel"
                    textAnchor="end"
                  >
                    IMPACT {(t.impact.y * 100).toFixed(0)}cm
                  </text>
                </g>
              )}
            </svg>
          </div>
        )}

        {showFront && (
          <div className="drs__stage drs__stage--front">
            <svg
              viewBox={`0 0 ${FRONT_W} ${FRONT_H}`}
              className="drs__svg drs__svg--front"
              role="img"
              aria-label="Predicted path at the stumps"
            >
              <line x1={0} y1={frontY(0)} x2={FRONT_W} y2={frontY(0)} className="drs__ground" />

              {/* three stumps and the bails, front on */}
              {[-STUMP_HALF + 0.019, 0, STUMP_HALF - 0.019].map((x, i) => (
                <rect
                  key={i}
                  x={frontX(x) - 4}
                  y={frontY(STUMP_HEIGHT)}
                  width={8}
                  height={frontY(0) - frontY(STUMP_HEIGHT)}
                  rx={2}
                  className="drs__stump"
                />
              ))}
              <rect
                x={frontX(-STUMP_HALF)}
                y={frontY(STUMP_HEIGHT) - 5}
                width={frontX(STUMP_HALF) - frontX(-STUMP_HALF)}
                height={5}
                className="drs__bail"
              />

              {/* the ball, where it would have arrived */}
              <circle
                cx={frontX(t.stumps.x)}
                cy={frontY(t.stumps.y)}
                r={(BALL_RADIUS / X_SPAN) * (FRONT_W / 2)}
                className={`drs__ball drs__ball--${verdictTone(result.wickets)}`}
              />
              <text x={FRONT_W / 2} y={FRONT_H - 8} className="drs__ticklabel" textAnchor="middle">
                PREDICTED IMPACT AT STUMPS
              </text>
            </svg>
          </div>
        )}

        <div className="drs__tests">
          <Test label="PITCHING" shown={reached("pitching")} value={PITCHING_LABEL[result.pitching] ?? ""} tone={verdictTone(result.pitching)} />
          <Test label="IMPACT" shown={reached("impact")} value={IMPACT_LABEL[result.impact] ?? ""} tone={verdictTone(result.impact)} />
          <Test label="WICKETS" shown={reached("wickets")} value={WICKETS_LABEL[result.wickets] ?? ""} tone={verdictTone(result.wickets)} />
        </div>

        {stage === "verdict" && (
          <div className={`drs__verdict drs__verdict--${outcome.finalDecision === "out" ? "out" : "notout"}`}>
            <p className="drs__headline">{outcome.headline}</p>
            <p className="drs__decision">{outcome.finalDecision === "out" ? "OUT" : "NOT OUT"}</p>
            <p className="drs__reason">{result.reason}</p>
            <p className="drs__retained">
              {outcome.reviewRetained ? "Review retained." : "Review lost."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Test({
  label,
  value,
  tone,
  shown,
}: {
  label: string;
  value: string;
  tone: "out" | "notout" | "call";
  shown: boolean;
}) {
  return (
    <div className={`drs__test${shown ? " is-shown" : ""} drs__test--${tone}`}>
      <span className="drs__testlabel">{label}</span>
      <span className="drs__testvalue">{shown ? value : "-"}</span>
    </div>
  );
}
