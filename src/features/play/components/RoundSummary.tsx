import { useState } from "react";
import { Certificate } from "./Certificate";
import { ACHIEVEMENTS } from "../progress/achievements";
import type { AppliedRound } from "../progress/applyRound";
import { buildShareText } from "../share";

interface Props {
  gameTitle: string;
  headline: string;
  /** One line of plain-English detail - what actually happened. */
  detail?: string;
  score: number;
  applied: AppliedRound | null;
  /** Per-round breakdown, shown as a list. Optional. */
  lines?: string[];
  onPlayAgain: () => void;
  onBackToHub: () => void;
  /**
   * An extra, game-specific button shown FIRST, for the case where the innings
   * ending is not the story ending. Cricket uses it for the Super Over after a
   * tie: "Play again" would throw away the match you just tied.
   */
  extraAction?: { label: string; onClick: () => void };
  /**
   * Whether this round earned a certificate.
   *
   * Defaults to TRUE, because most games here have no opponent - finishing a
   * round of Pin the Place or the Daily IS the achievement, and there is
   * nothing else it could mean to "win" one. The two games you can genuinely
   * lose, Cricket and Four in a Row, pass the real result.
   */
  won?: boolean;
  /** What the score column is called on the certificate, e.g. "Runs". */
  scoreLabel?: string;
}

/**
 * The screen every game ends on. One component so a win in Cricket and a win
 * in Four-in-a-Row feel like the same product, and so the XP, personal-best
 * and achievement feedback can't drift between games.
 *
 * The share text is built from what actually happened - no invented ranking,
 * no "you beat 87% of players", because there is no server and therefore no
 * such number. Copying is the only share action: a Web Share sheet that
 * silently does nothing on desktop is worse than a button that always works.
 */
export function RoundSummary({ gameTitle, headline, detail, score, applied, lines, onPlayAgain, onBackToHub, extraAction, won = true, scoreLabel }: Props) {
  const [copied, setCopied] = useState(false);

  const unlocked = (applied?.unlockedNow ?? [])
    .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a);

  const share = async () => {
    const text = buildShareText({ gameTitle, headline, score, lines });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard blocked (no permission, insecure context). Say so rather
      // than showing a success state that didn't happen.
      setCopied(false);
      window.prompt("Copy your result:", text);
    }
  };

  return (
    <div className="round-summary">
      <p className="round-summary__headline">{headline}</p>
      {detail && <p className="round-summary__detail">{detail}</p>}

      <p className="round-summary__score">
        <span>{score.toLocaleString()}</span> points
      </p>

      <div className="round-summary__badges">
        {applied?.newPersonalBest && <span className="round-summary__badge round-summary__badge--best">🏆 New personal best</span>}
        {applied && applied.xpGained > 0 && <span className="round-summary__badge">+{applied.xpGained} XP</span>}
        {applied?.streakExtended && applied.stats.currentStreak > 1 && (
          <span className="round-summary__badge">🔥 {applied.stats.currentStreak}-day streak</span>
        )}
      </div>

      {unlocked.length > 0 && (
        <div className="round-summary__unlocked">
          <h4>Achievement unlocked</h4>
          <ul>
            {unlocked.map((a) => (
              <li key={a.id}>
                <span aria-hidden="true">{a.icon}</span> <strong>{a.title}</strong>: {a.requirement}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lines && lines.length > 0 && (
        <ol className="round-summary__lines">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      )}

      {/*
        The certificate, on screen rather than buried in the share flow.

        People screenshot things. A reward that only exists as a file you have
        to deliberately export is a reward almost nobody ever sees, which is
        why this sits here, finished, the moment they win.
      */}
      {won && (
        <Certificate gameTitle={gameTitle} headline={headline} score={score} scoreLabel={scoreLabel} detail={detail} />
      )}

      <div className="round-summary__actions">
        {extraAction && (
          <button type="button" className="play-btn play-btn--primary" onClick={extraAction.onClick}>
            {extraAction.label}
          </button>
        )}
        <button
          type="button"
          className={extraAction ? "play-btn" : "play-btn play-btn--primary"}
          onClick={onPlayAgain}
        >
          Play again
        </button>
        <button type="button" className="play-btn" onClick={share}>
          {copied ? "Copied ✓" : "Copy result"}
        </button>
        <button type="button" className="play-btn play-btn--quiet" onClick={onBackToHub}>
          All games
        </button>
      </div>
    </div>
  );
}
