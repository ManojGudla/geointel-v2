/**
 * The shareable result card.
 *
 * Text scores copy fine and spread badly. People post pictures. This draws a
 * result as a PNG so a good round can leave the site, which is the only
 * marketing this project has.
 *
 * ── Why this is a score card and not a certificate ────────────────────────
 *
 * A certificate asserts that some authority verified something. Nothing here
 * is verified: there are no accounts, no server-side scoring, and every score
 * lives in the player's own browser storage where anyone can edit it. Issuing
 * a "certificate" for a number the player could type themselves would be a
 * claim this system cannot back, on a product whose entire position is that
 * it shows its sources and does not overclaim.
 *
 * So the card says what it is - a game score, with a date - and the wording
 * below is deliberately plain for that reason. If real credentials are ever
 * wanted, the honest route is accounts plus server-validated results, and the
 * claim becomes true rather than decorative.
 *
 * ── On emoji ──────────────────────────────────────────────────────────────
 *
 * None are drawn. Canvas emoji rendering varies by platform and font
 * availability - on some Android builds a missing glyph draws as a hollow box
 * - and a shared image is exactly where a broken character does the most
 * damage, because it travels without you.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export interface ScoreCard {
  /** The game, shown small and uppercase at the top. */
  game: string;
  /** The number, shown large. Already formatted for display. */
  score: string;
  /** Up to three short supporting figures. */
  stats: Array<{ label: string; value: string }>;
  /** Rendered bottom-left. */
  dateLabel: string;
}

const MAX_STATS = 3;

/** Two-digit day, full month, four-digit year - unambiguous in every locale. */
export function formatCardDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Builds the card model.
 *
 * Kept separate from drawing so the wording can be tested exactly. Canvas
 * cannot be asserted against in a unit test, but "does this card leak the
 * answers" absolutely can, and that is the property worth protecting.
 */
export function buildScoreCard(input: {
  game: string;
  score: number | string;
  stats: Array<{ label: string; value: string | number }>;
  date?: Date;
}): ScoreCard {
  return {
    game: input.game.trim().toUpperCase(),
    score: typeof input.score === "number" ? input.score.toLocaleString() : input.score,
    stats: input.stats
      .slice(0, MAX_STATS)
      .map((s) => ({ label: s.label.toUpperCase(), value: String(s.value) })),
    dateLabel: formatCardDate(input.date ?? new Date()),
  };
}

/** A filename that sorts by date and says what it is. */
export function cardFilename(card: ScoreCard, date = new Date()): string {
  const slug = card.game.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `manowj-${slug || "score"}-${stamp}.png`;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const INK = {
  ground: "#0d1f3c",
  accent: "#4f8ef7",
  text: "#ffffff",
  muted: "#9db3d4",
};

/** Letter-spaced small caps, which canvas has no native support for. */
function drawTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
}

export function drawScoreCard(ctx: CanvasRenderingContext2D, card: ScoreCard): void {
  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Ground, with a soft light from the top left so the card is not a flat
  // rectangle of navy.
  ctx.fillStyle = INK.ground;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const glow = ctx.createRadialGradient(220, 120, 40, 220, 120, 900);
  glow.addColorStop(0, "rgba(79,142,247,0.30)");
  glow.addColorStop(1, "rgba(79,142,247,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Accent rule down the left edge.
  ctx.fillStyle = INK.accent;
  ctx.fillRect(0, 0, 10, CARD_HEIGHT);

  ctx.textBaseline = "alphabetic";

  // Game name.
  ctx.fillStyle = INK.accent;
  ctx.font = `800 26px ${FONT}`;
  drawTracked(ctx, card.game, 78, 128, 4);

  // The number. This is what the card exists to show.
  ctx.fillStyle = INK.text;
  ctx.font = `800 172px ${FONT}`;
  ctx.fillText(card.score, 74, 300);

  // Supporting figures, evenly spaced across a single row.
  const top = 400;
  card.stats.forEach((stat, i) => {
    const x = 78 + i * 350;
    ctx.fillStyle = INK.muted;
    ctx.font = `700 20px ${FONT}`;
    drawTracked(ctx, stat.label, x, top, 2.5);
    ctx.fillStyle = INK.text;
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText(stat.value, x, top + 62);
  });

  // Footer rule, then date on the left and the site on the right.
  ctx.fillStyle = "rgba(157,179,212,0.25)";
  ctx.fillRect(78, CARD_HEIGHT - 118, CARD_WIDTH - 156, 1);

  ctx.fillStyle = INK.muted;
  ctx.font = `600 24px ${FONT}`;
  ctx.fillText(card.dateLabel, 78, CARD_HEIGHT - 62);

  ctx.font = `800 26px ${FONT}`;
  ctx.fillStyle = INK.text;
  const site = "manowj.com";
  ctx.fillText(site, CARD_WIDTH - 78 - ctx.measureText(site).width, CARD_HEIGHT - 62);
}

function renderToCanvas(card: ScoreCard): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawScoreCard(ctx, card);
  return canvas;
}

export async function scoreCardBlob(card: ScoreCard): Promise<Blob | null> {
  const canvas = renderToCanvas(card);
  if (!canvas) return null;
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "failed";

/**
 * Share the card, or save it if sharing is unavailable.
 *
 * Native sharing on a phone is the whole point - it puts the image one tap
 * from WhatsApp. Desktop browsers mostly cannot share files, so those get a
 * download instead of an error, and the caller is told which happened so it
 * can say the right thing.
 */
export async function shareScoreCard(card: ScoreCard, text: string): Promise<ShareOutcome> {
  const blob = await scoreCardBlob(card);
  if (!blob) return "failed";
  const file = new File([blob], cardFilename(card), { type: "image/png" });

  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; text?: string }) => Promise<void>;
  };

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return "shared";
    } catch (error) {
      // A user dismissing the sheet is not a failure and must not be reported
      // as one; anything else falls through to a download so they still get
      // the image.
      if ((error as Error)?.name === "AbortError") return "cancelled";
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = cardFilename(card);
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked on the next tick: revoking immediately can cancel the download
    // in some browsers before it has started reading the blob.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  } catch {
    return "failed";
  }
}
