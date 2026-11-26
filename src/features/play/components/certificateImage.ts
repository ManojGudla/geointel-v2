/**
 * The certificate, as words and as a picture.
 *
 * The words are built here once (certificateText) and used by both the
 * on-screen certificate and the downloadable image, so the two can never
 * say different things. The picture is drawn on a canvas at print size, so
 * the PNG a player downloads, posts or prints is sharp.
 *
 * ── What it claims, and what it does not ──────────────────────────────────
 *
 * The owner asked on 26 November 2026 for a certificate that says
 * "Congratulations", carries a name the player types in, and looks like a
 * proper, professional certificate. It does all three. What it does not do
 * is pretend to be something it is not: there is no credential number, no
 * "verified" stamp and no accrediting body, because nothing here is checked
 * by a server (scores live in the player's own browser). The issuer is named
 * plainly as maNOWj PLAY, and one line of small print says it records a game
 * result and is not an academic or professional qualification. That line is
 * what lets the rest of it look as formal as it likes.
 */

export const CERT_WIDTH = 2000;
export const CERT_HEIGHT = 1414; // A4 landscape proportions, 297 x 210.

export const CERT_FINE_PRINT = "A record of a game result on maNOWj PLAY. Not an academic or professional qualification.";

export interface CertificateInput {
  name: string;
  gameTitle: string;
  headline: string;
  score: number;
  scoreLabel?: string;
  detail?: string;
  issuedOn: Date;
}

export interface CertificateText {
  brand: string;
  title: string;
  congratulations: string;
  presentedTo: string;
  name: string;
  forLine: string;
  game: string;
  result: string;
  detail?: string;
  dateLabel: string;
  date: string;
  issuerLabel: string;
  issuer: string;
  fine: string;
  site: string;
}

export const NAME_MAX = 40;

/**
 * A name as it may appear on the certificate: letters of any script (so
 * Telugu, Hindi and Tamil names work, not just English ones), spaces, full
 * stops, apostrophes and hyphens. Anything else is dropped, spaces are
 * collapsed and the result is capped in length. Nothing typed here can turn
 * into markup or break the layout.
 */
export function cleanName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{M}\s.'’-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

/** At least two letters: a single initial does not make a name. */
export function isValidName(raw: string): boolean {
  return cleanName(raw).replace(/[\s.'’-]/g, "").length >= 2;
}

/** "26 November 2026": unambiguous in every country, unlike 11/26 or 26/11. */
export function formatIssueDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function certificateText(input: CertificateInput): CertificateText {
  const label = (input.scoreLabel ?? "Score").trim();
  const score = input.score.toLocaleString("en-IN");
  return {
    brand: "maNOWj PLAY",
    title: "Certificate of Achievement",
    congratulations: "Congratulations",
    presentedTo: "This certificate is proudly presented to",
    name: cleanName(input.name),
    forLine: "for an outstanding performance in",
    game: input.gameTitle,
    result: `${input.headline} · ${label}: ${score}`,
    detail: input.detail?.trim() || undefined,
    dateLabel: "Date of issue",
    date: formatIssueDate(input.issuedOn),
    issuerLabel: "Issued by",
    issuer: "maNOWj PLAY",
    fine: CERT_FINE_PRINT,
    site: "www.manowj.com",
  };
}

function slug(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .toLowerCase()
      .slice(0, 40) || "player"
  );
}

export function certificateFileName(input: Pick<CertificateInput, "name" | "gameTitle">): string {
  return `maNOWj-PLAY-certificate-${slug(input.gameTitle)}-${slug(cleanName(input.name))}.png`;
}

// ── Drawing ─────────────────────────────────────────────────────────────────

const NAVY = "#14213d";
const GOLD = "#b8892b";
const GOLD_LIGHT = "#e3c06a";
const INK_SOFT = "#4a5568";
const PAPER = "#fdfaf2";
const SERIF = 'Georgia, "Times New Roman", "Noto Serif", serif';

/** Sets the font, shrinking it until `text` fits in `maxWidth`. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: string, size: number, maxWidth: number, family = SERIF): number {
  let s = size;
  for (; s > 12; s -= 2) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  return s;
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function corner(ctx: CanvasRenderingContext2D, x: number, y: number, dx: 1 | -1, dy: 1 | -1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dx, dy);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.lineTo(0, 0);
  ctx.lineTo(90, 0);
  ctx.stroke();
  // A small diamond inside the angle.
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(28, 18);
  ctx.lineTo(38, 28);
  ctx.lineTo(28, 38);
  ctx.lineTo(18, 28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The seal: a gold rosette with the brand around a star. */
function seal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  // Rosette edge.
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  const teeth = 36;
  for (let i = 0; i <= teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.92;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * 0.85);
  g.addColorStop(0, GOLD_LIGHT);
  g.addColorStop(1, GOLD);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  // Brand around the ring.
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(r * 0.15)}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = "maNOWj PLAY · ACHIEVEMENT · ";
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const a = -Math.PI / 2 + (i / chars.length) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r * 0.77, cy + Math.sin(a) * r * 0.77);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(chars[i]!, 0, 0);
    ctx.restore();
  }
  ctx.fillStyle = "#ffffff";
  star(ctx, cx, cy, r * 0.42, r * 0.18);
  ctx.fill();
  ctx.restore();
}

export function drawCertificate(ctx: CanvasRenderingContext2D, t: CertificateText, logo?: CanvasImageSource | null) {
  const W = CERT_WIDTH;
  const H = CERT_HEIGHT;
  const cx = W / 2;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Paper.
  const paper = ctx.createRadialGradient(cx, H * 0.45, H * 0.1, cx, H * 0.5, W * 0.7);
  paper.addColorStop(0, "#ffffff");
  paper.addColorStop(1, PAPER);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // Frame: a navy band, a gold rule inside it, and gold corners.
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 28;
  ctx.strokeRect(34, 34, W - 68, H - 68);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 5;
  ctx.strokeRect(72, 72, W - 144, H - 144);
  ctx.lineWidth = 2;
  ctx.strokeRect(86, 86, W - 172, H - 172);
  corner(ctx, 104, 104, 1, 1);
  corner(ctx, W - 104, 104, -1, 1);
  corner(ctx, 104, H - 104, 1, -1);
  corner(ctx, W - 104, H - 104, -1, -1);

  // Brand.
  let y = 205;
  if (logo) {
    try {
      ctx.drawImage(logo, cx - 210, y - 52, 64, 64);
    } catch {
      /* a logo that failed to load is left out, never a broken box */
    }
  }
  ctx.fillStyle = NAVY;
  ctx.font = `700 46px ${SERIF}`;
  ctx.fillText(t.brand, cx + (logo ? 36 : 0), y);

  // Title.
  y += 120;
  ctx.fillStyle = NAVY;
  fit(ctx, t.title.toUpperCase(), "700", 74, W - 420);
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "6px";
  ctx.fillText(t.title.toUpperCase(), cx, y);
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";

  // Ornamental rule.
  y += 46;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 260, y);
  ctx.lineTo(cx - 24, y);
  ctx.moveTo(cx + 24, y);
  ctx.lineTo(cx + 260, y);
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(cx, y - 12);
  ctx.lineTo(cx + 12, y);
  ctx.lineTo(cx, y + 12);
  ctx.lineTo(cx - 12, y);
  ctx.closePath();
  ctx.fill();

  // Congratulations.
  y += 118;
  ctx.fillStyle = GOLD;
  ctx.font = `italic 700 96px ${SERIF}`;
  ctx.fillText(t.congratulations, cx, y);

  y += 82;
  ctx.fillStyle = INK_SOFT;
  ctx.font = `400 38px ${SERIF}`;
  ctx.fillText(t.presentedTo, cx, y);

  // The name.
  y += 140;
  ctx.fillStyle = NAVY;
  fit(ctx, t.name, "italic 700", 118, W - 520);
  ctx.fillText(t.name, cx, y);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 520, y + 34);
  ctx.lineTo(cx + 520, y + 34);
  ctx.stroke();

  // What for.
  y += 112;
  ctx.fillStyle = INK_SOFT;
  ctx.font = `400 38px ${SERIF}`;
  ctx.fillText(t.forLine, cx, y);
  y += 66;
  ctx.fillStyle = NAVY;
  fit(ctx, t.game, "700", 56, W - 420);
  ctx.fillText(t.game, cx, y);
  y += 64;
  ctx.fillStyle = NAVY;
  fit(ctx, t.result, "400", 40, W - 420);
  ctx.fillText(t.result, cx, y);
  if (t.detail) {
    y += 52;
    ctx.fillStyle = INK_SOFT;
    fit(ctx, t.detail, "italic 400", 32, W - 520);
    ctx.fillText(t.detail, cx, y);
  }

  // Footer: date, seal, issuer.
  const footY = H - 250;
  const colW = 440;
  for (const [x, value, label] of [
    [cx - 560, t.date, t.dateLabel],
    [cx + 560, t.issuer, t.issuerLabel],
  ] as const) {
    ctx.fillStyle = NAVY;
    fit(ctx, value, x > cx ? "italic 700" : "700", 42, colW);
    ctx.fillText(value, x, footY);
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - colW / 2, footY + 22);
    ctx.lineTo(x + colW / 2, footY + 22);
    ctx.stroke();
    ctx.fillStyle = INK_SOFT;
    ctx.font = `400 30px ${SERIF}`;
    ctx.fillText(label, x, footY + 64);
  }
  seal(ctx, cx, footY - 18, 104);

  // Small print.
  ctx.fillStyle = "#6b7280";
  fit(ctx, `${t.site} · ${t.fine}`, "400", 26, W - 360);
  ctx.fillText(`${t.site} · ${t.fine}`, cx, H - 118);
  ctx.restore();
}

/** Draws the certificate and returns it as a PNG blob, or null where the browser cannot. */
export async function renderCertificatePng(t: CertificateText): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = CERT_WIDTH;
  canvas.height = CERT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const logo = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/icons/icon-192.png";
  });
  try {
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  } catch {
    /* fonts not ready is fine: the serif stack falls back */
  }
  drawCertificate(ctx, t, logo);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
