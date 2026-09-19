import { useMemo, useState } from "react";
import "./Certificate.css";

/**
 * The card a player gets for winning.
 *
 * Three redesigns of this were reworked and rejected, and the last piece of
 * feedback was the useful one: people were laughing at it. Every previous
 * attempt treated that as a styling problem and made the diploma cleaner. It
 * was never a styling problem. A landscape sheet reading "Achievement
 * Certificate", "Presented to", and "Credential ID: MJ-CRI-84-Q7FX" for
 * scoring points in a geography game is funny because of what it claims to
 * be, and no amount of typography fixes a format that is pretending.
 *
 * So this is not a certificate any more. It is a result card: the shape
 * every game people actually share uses, from a Wordle grid to a workout
 * summary. Portrait, because it is screenshotted on a phone and posted.
 * Score first and enormous, because that is the only thing anyone is
 * sharing. Everything else is one line or gone.
 *
 * Gone specifically: the word Certificate, "Presented to", the credential
 * ID, the fake reference code, the awarded-date label, and the disclaimer
 * explaining that a game result is not a qualification. That last one was
 * only ever needed because the card was dressed as something it wasn't. A
 * card that looks like a game score needs no footnote saying it is one.
 *
 * The props are unchanged, so RoundSummary and every game calling it are
 * untouched.
 */
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
    () => new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
    []
  );

  return (
    <figure className="score-card" aria-label={`${gameTitle} result`}>
      <div className="score-card__sheet">
        <header className="score-card__head">
          <span className="score-card__game">{gameTitle}</span>
          <span className="score-card__date">{awarded}</span>
        </header>

        {/*
          The whole point of the card. Tabular figures so a four-digit score
          sits on the same centre line as a two-digit one, and a deliberately
          tight line-height so the number reads as a single graphic mark
          rather than as a line of text.
        */}
        <div className="score-card__scoreblock">
          <strong className="score-card__score">{score.toLocaleString()}</strong>
          <span className="score-card__score-label">{scoreLabel}</span>
        </div>

        <p className="score-card__headline">{headline}</p>
        {detail && <p className="score-card__detail">{detail}</p>}

        {/*
          Optional, and it says so. The product has no accounts, and the old
          card made this a ruled blank under "Presented to", which read as an
          unfilled form and made an unnamed card look incomplete. Here the
          card is finished without it and a name simply personalises it.
        */}
        <input
          className="score-card__name"
          type="text"
          value={name}
          maxLength={28}
          placeholder="Add your name (optional)"
          aria-label="Your name on this result card"
          onChange={(e) => setName(e.target.value)}
        />

        <footer className="score-card__foot">
          <img className="score-card__mark" src="/icons/icon-32.png" alt="" width={20} height={20} aria-hidden="true" />
          <span>manowj.com</span>
        </footer>
      </div>

      <figcaption className="score-card__hint">Screenshot it to share.</figcaption>
    </figure>
  );
}
