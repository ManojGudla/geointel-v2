import { useMemo, useState } from "react";
import "./Certificate.css";

/**
 * The certificate a player gets for winning.
 *
 * It is rendered ON SCREEN, finished, at the moment they win — not built
 * inside a share flow they have to go looking for. That was the whole point of
 * the request: people screenshot things, and a reward that only exists as a
 * file you must deliberately export is a reward almost nobody ever sees.
 *
 * The design brief, after two rounds of real feedback, is a modern digital
 * credential rather than a printed diploma. The earlier version had a gold
 * pressed seal, a guilloché ground, a double gold rule, a script signature
 * and Georgia throughout. Every one of those is a genuine convention of
 * printed certificates, and together on a screen they read as a template.
 * People said so plainly: too much, too big, not good.
 *
 * So this strips the ornament and spends the space on the two things anyone
 * actually screenshots: the name and the score. One typeface, one accent
 * colour, one hairline, and a lot of white. Nothing here is decorative —
 * every mark on the card is either the brand, a fact, or a divider between
 * facts.
 *
 * What it still deliberately does NOT do is pretend to be a qualification.
 * There is no accreditation and no claim that a skill was assessed. The
 * credential ID is described as what it is, and the footer says in plain
 * words that this is a game result. A game score dressed up as a credential
 * is a small lie that would eventually embarrass whoever shared it, which is
 * the opposite of what this is for.
 */

/**
 * A short, stable code for one result.
 *
 * Deterministic, so the same win always produces the same code — which is
 * what makes it read as a reference rather than a random string. It verifies
 * nothing and is not claimed to; see the note under it on the card.
 */
function referenceCode(parts: string): string {
  let hash = 0;
  for (let i = 0; i < parts.length; i++) {
    hash = (hash << 5) - hash + parts.charCodeAt(i);
    hash |= 0;
  }
  // No I, O, 0 or 1: this is a code people retype and read aloud.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  let value = Math.abs(hash);
  for (let i = 0; i < 4; i++) {
    out += alphabet[value % alphabet.length];
    value = Math.floor(value / alphabet.length);
  }
  return out;
}

/** Three letters standing for the game, so the ID says which one at a glance. */
function gameTag(gameTitle: string): string {
  const letters = gameTitle.replace(/[^a-z]/gi, "");
  return (letters.slice(0, 3) || "GAM").toUpperCase();
}

export function Certificate({
  gameTitle,
  headline,
  score,
  scoreLabel = "Score",
  detail,
}: {
  gameTitle: string;
  /** What they achieved, in the game's own words. */
  headline: string;
  score: number;
  scoreLabel?: string;
  /** One optional line of context, e.g. the target they chased. */
  detail?: string;
}) {
  const [name, setName] = useState("");

  const awarded = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [],
  );

  const credentialId = useMemo(
    () =>
      `MJ-${gameTag(gameTitle)}-${score}-${referenceCode(
        `${gameTitle}|${score}|${new Date().toDateString()}`,
      )}`,
    [gameTitle, score],
  );

  return (
    <figure className="cert" aria-label="Certificate of achievement">
      <div className="cert__sheet">
        <header className="cert__head">
          {/* The real logo, not a typeset name. It is the single strongest
              signal that this came from a specific place rather than being a
              generic template, and with the ornament gone it is now the only
              piece of graphic on the card. */}
          <img className="cert__logo" src="/logo.png" alt="maNOWj GeoIntel" width={128} height={88} />
          <p className="cert__kicker">
            Achievement
            <br />
            Certificate
          </p>
        </header>

        <div className="cert__hero">
          <p className="cert__label">Presented to</p>

          {/* An input styled as a ruled blank. The product has no accounts,
              and printing "Player" is the one thing guaranteed to stop
              somebody sharing it. */}
          <input
            className="cert__name"
            type="text"
            value={name}
            maxLength={32}
            placeholder="Write your name"
            aria-label="Your name, as it appears on the certificate"
            onChange={(e) => setName(e.target.value)}
          />

          <p className="cert__context">
            <span className="cert__game">{gameTitle}</span>
            <span className="cert__dot" aria-hidden="true" />
            {headline}
          </p>

          {/* The score, given the size the brief asked for. Tabular figures so
              a three-digit result does not shift the card's centre line. */}
          <p className="cert__score">
            <span className="cert__score-value">{score.toLocaleString()}</span>
            <span className="cert__score-label">{scoreLabel}</span>
          </p>

          {detail && <p className="cert__detail">{detail}</p>}
        </div>

        <footer className="cert__foot">
          <dl className="cert__facts">
            <div>
              <dt>Awarded</dt>
              <dd>{awarded}</dd>
            </div>
            <div>
              <dt>Credential ID</dt>
              <dd className="cert__id">{credentialId}</dd>
            </div>
          </dl>

          <div className="cert__issuer">
            <span className="cert__site">maNOWj.com</span>
            {/* Says exactly what this is. A credential ID on a card that
                looks official has to be followed by the truth about what it
                certifies, which is a game. */}
            <span className="cert__disclaimer">Issued by maNOWj GeoIntel · a game result, not a qualification</span>
          </div>
        </footer>
      </div>

      <figcaption className="cert__hint">Write your name, then screenshot it to share.</figcaption>
    </figure>
  );
}
