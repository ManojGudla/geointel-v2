/**
 * The text people paste into a chat after a round.
 *
 * Two rules it follows. First, it only states what happened — a score, a
 * headline, the round-by-round lines. There is no percentile, no rank and no
 * "better than N players", because this product has no accounts and no
 * server-side leaderboard, so any such number would be invented.
 *
 * Second, it carries the URL, because the entire point of a shareable result
 * is that whoever reads it can go and try the same thing.
 */
export interface ShareInput {
  gameTitle: string;
  headline: string;
  score: number;
  lines?: string[];
}

export const PLAY_URL = "https://manowj.com";

/** Turns a per-round score into a compact emoji bar, Wordle-style. */
export function scoreBar(score: number, max: number): string {
  if (max <= 0) return "";
  const filled = Math.max(0, Math.min(5, Math.round((score / max) * 5)));
  return "🟩".repeat(filled) + "⬜".repeat(5 - filled);
}

export function buildShareText({ gameTitle, headline, score, lines }: ShareInput): string {
  const parts = [`maNOWj PLAY — ${gameTitle}`, headline, `Score: ${score.toLocaleString()}`];
  if (lines && lines.length) parts.push("", ...lines);
  parts.push("", PLAY_URL);
  return parts.join("\n");
}
