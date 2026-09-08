import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayStore } from "../../progress/playStore";
import { playTone } from "../../sound";
import { buildScoreCard, shareScoreCard } from "../../share/shareCard";
import {
  GRID,
  ROUNDS_PER_GAME,
  buildChangeGame,
  changePoints,
  readableDate,
  tileGrid,
  yearsApart,
} from "./changeEngine";
import "./change.css";

/**
 * Spot the Change — two satellite views of the same place, years apart.
 *
 * This is the only game in the hub built on the product's own data rather than
 * a generic quiz bank: the images are live NASA GIBS tiles, fetched at the two
 * dates named on screen, from the same imagery archive the Data tab exposes.
 * Nothing here is a stock photo or an illustration.
 *
 * The honesty constraint drove the whole design. GIBS is 250 metres per pixel,
 * so it shows lakes drying, forests going, reservoirs filling — and cannot
 * show a new building or a new road. changeSites.ts explains why the obvious
 * crowd-pleasers had to be left out rather than included as vague smudges.
 *
 * The place is never named until after the answer. Naming it turns a looking
 * game into a knowing game, and the point is to make people look.
 */

type Phase = "intro" | "playing" | "over";
const REVEAL_MS = 5200;

function TileGrid({
  urls,
  label,
  onSettled,
}: {
  urls: string[];
  label: string;
  onSettled: (loaded: number) => void;
}) {
  /**
   * Counts how many of the nine tiles actually arrived.
   *
   * GIBS has real holes in its archive, and a date it does not hold does not
   * return a helpful error — it returns nothing, or an empty tile. Without
   * this the player would be shown a black square and asked what changed,
   * which is the worst possible version of this game: they cannot answer, and
   * they have no way to tell whether that is their fault.
   *
   * A ref rather than state because it is written once per image event and
   * must not re-render the grid mid-load.
   */
  const settled = useRef(0);
  const loaded = useRef(0);

  useEffect(() => {
    settled.current = 0;
    loaded.current = 0;
  }, [urls]);

  const mark = (ok: boolean) => {
    settled.current += 1;
    if (ok) loaded.current += 1;
    if (settled.current === urls.length) onSettled(loaded.current);
  };

  return (
    <div
      className="change__grid"
      style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)` }}
      role="img"
      aria-label={label}
    >
      {urls.map((url) => (
        <img
          key={url}
          src={url}
          alt=""
          loading="eager"
          decoding="async"
          draggable={false}
          onLoad={() => mark(true)}
          onError={() => mark(false)}
        />
      ))}
    </div>
  );
}

export function SpotTheChange({ onBackToHub }: { onBackToHub: () => void }) {
  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const best = usePlayStore((s) => s.statsFor("spot-the-change").bestScore);

  const [phase, setPhase] = useState<Phase>("intro");
  const [seed, setSeed] = useState(() => Date.now());
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  /** How many tiles arrived in each pane, once every request has settled. */
  const [paneLoads, setPaneLoads] = useState<{ before?: number; after?: number }>({});

  const rounds = useMemo(() => buildChangeGame(seed), [seed]);
  const current = rounds[Math.min(round, rounds.length - 1)];
  const askedAt = useRef(Date.now());
  const timer = useRef<number | null>(null);
  const recorded = useRef(false);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (phase !== "over" || recorded.current) return;
    recorded.current = true;
    recordRound({
      gameId: "spot-the-change",
      score,
      outcome: "complete",
      perfect: correctCount === rounds.length,
    });
  }, [phase, score, correctCount, rounds.length, recordRound]);

  const start = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    recorded.current = false;
    setSeed(Date.now());
    setRound(0);
    setScore(0);
    setCorrectCount(0);
    setPicked(null);
    setPaneLoads({});
    askedAt.current = Date.now();
    setPhase("playing");
  }, []);

  const advance = useCallback(() => {
    setPicked(null);
    setPaneLoads({});
    askedAt.current = Date.now();
    if (round + 1 >= rounds.length) setPhase("over");
    else setRound((r) => r + 1);
  }, [round, rounds.length]);

  const answer = (option: string) => {
    if (picked !== null || !current) return;
    const right = option === current.answer;
    setPicked(option);
    if (soundEnabled) playTone(right ? 880 : 200, 0.09);
    if (right) {
      setScore((s) => s + changePoints(true, (Date.now() - askedAt.current) / 1000));
      setCorrectCount((n) => n + 1);
    }
    timer.current = window.setTimeout(advance, REVEAL_MS);
  };

  /**
   * A round is only askable if enough of both views arrived.
   *
   * Half the grid is the threshold rather than all of it: a single missing
   * corner tile still leaves a perfectly readable picture, and refusing the
   * round for that would throw away good questions.
   */
  const bothPanesSettled = paneLoads.before !== undefined && paneLoads.after !== undefined;
  const minTiles = Math.ceil((GRID * GRID) / 2);
  const imageryFailed =
    bothPanesSettled && (paneLoads.before! < minTiles || paneLoads.after! < minTiles);

  const skipRound = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    advance();
  };

  const share = async () => {
    const card = buildScoreCard({
      game: "Spot the Change",
      score,
      stats: [
        { label: "Correct", value: `${correctCount}/${rounds.length}` },
        { label: "Your best", value: Math.max(best, score).toLocaleString() },
      ],
    });
    const outcome = await shareScoreCard(card, `maNOWj Spot the Change — ${score.toLocaleString()}\nhttps://www.manowj.com`);
    setShared(outcome === "downloaded" ? "Saved as an image" : outcome === "shared" ? "Shared" : null);
    if (outcome !== "cancelled") window.setTimeout(() => setShared(null), 2600);
  };

  if (phase === "intro") {
    return (
      <section className="change" aria-label="Spot the Change">
        <p className="change__eyebrow">Spot the Change</p>
        <h2 className="change__title">Two satellite views. Years apart. What happened?</h2>
        <p className="change__lede">
          Real NASA satellite imagery of a real place, on two real dates. Look at both, then say what changed.
        </p>
        <ul className="change__rules">
          <li>{ROUNDS_PER_GAME} places, one question each.</li>
          <li>The place is not named until after you answer.</li>
          <li>Answer quickly for more points. A wrong answer costs nothing.</li>
        </ul>
        <p className="change__note">
          The imagery is NASA GIBS at 250 metres per pixel, the same archive as the Data tab. That is sharp enough
          to show a lake drying or a forest going, and not sharp enough to show a building. Every change here is
          tens of kilometres across, and every one has a source shown when you answer.
        </p>
        {best > 0 ? <p className="change__pb">Your best: {best.toLocaleString()}</p> : null}
        <div className="change__actions">
          <button type="button" className="change__primary" onClick={start}>
            Start
          </button>
          <button type="button" className="change__quiet" onClick={onBackToHub}>
            Back
          </button>
        </div>
      </section>
    );
  }

  if (phase === "over") {
    return (
      <section className="change" aria-label="Spot the Change result">
        <p className="change__eyebrow">Finished</p>
        <p className="change__final">{score.toLocaleString()}</p>
        {score >= best && score > 0 ? <p className="change__pb">New personal best</p> : null}
        <dl className="change__stats">
          <div>
            <dt>Correct</dt>
            <dd>
              {correctCount}/{rounds.length}
            </dd>
          </div>
          <div>
            <dt>Your best</dt>
            <dd>{Math.max(best, score).toLocaleString()}</dd>
          </div>
        </dl>
        <ol className="change__review">
          {rounds.slice(0, round + 1).map((r) => (
            <li key={r.site.id}>
              <strong>{r.site.name}</strong>, {r.site.country} — {r.site.answer.toLowerCase()}
            </li>
          ))}
        </ol>
        <div className="change__actions">
          <button type="button" className="change__primary" onClick={start}>
            Go again
          </button>
          <button type="button" className="change__quiet" onClick={() => void share()}>
            {shared ?? "Share"}
          </button>
          <button type="button" className="change__quiet" onClick={onBackToHub}>
            Back to games
          </button>
        </div>
      </section>
    );
  }

  if (!current) return null;
  const revealed = picked !== null;
  const gap = yearsApart(current.site.before, current.site.after);

  return (
    <section className="change" aria-label="Spot the Change, in play">
      <header className="change__bar">
        <button type="button" className="change__back" onClick={onBackToHub}>
          ← Quit
        </button>
        <p className="change__progress">
          {round + 1} of {rounds.length}
        </p>
        <p className="change__score">{score.toLocaleString()}</p>
      </header>

      <div className="change__panes">
        <figure className="change__pane">
          <figcaption>{readableDate(current.site.before)}</figcaption>
          {/* Keyed by date so React swaps the images when the round changes
              instead of reusing the previous round's loaded tiles. */}
          <TileGrid
            key={`${current.site.id}-before`}
            urls={tileGrid(current.site, current.site.before)}
            label={`Satellite view, ${readableDate(current.site.before)}`}
            onSettled={(n) => setPaneLoads((p) => ({ ...p, before: n }))}
          />
        </figure>
        <figure className="change__pane">
          <figcaption>{readableDate(current.site.after)}</figcaption>
          <TileGrid
            key={`${current.site.id}-after`}
            urls={tileGrid(current.site, current.site.after)}
            label={`Satellite view of the same place, ${readableDate(current.site.after)}`}
            onSettled={(n) => setPaneLoads((p) => ({ ...p, after: n }))}
          />
        </figure>
      </div>

      <p className="change__gap">
        Same place, {gap === 0 ? "about two years" : `${gap} years`} apart
        {current.site.layer === "falsecolor" ? " · false colour: plants read bright, water reads dark" : ""}
      </p>

      {imageryFailed ? (
        /**
         * Says what went wrong and offers the way out, rather than showing a
         * black square and a question. The player is not being marked on a
         * round the imagery could not support, so skipping costs them nothing.
         */
        <div className="change__failed">
          <p>
            <strong>This view didn&apos;t load.</strong> NASA&apos;s archive has gaps, and it looks like one of these two
            dates is in one. Nothing you did.
          </p>
          <button type="button" className="change__primary" onClick={skipRound}>
            Skip to the next place
          </button>
        </div>
      ) : null}

      <h3 className="change__prompt">What changed here?</h3>

      <div className="change__options">
        {current.options.map((option) => {
          const tone = !revealed
            ? ""
            : option === current.answer
              ? " change__opt--right"
              : option === picked
                ? " change__opt--wrong"
                : " change__opt--dim";
          return (
            <button
              key={option}
              type="button"
              className={`change__opt${tone}`}
              disabled={revealed || imageryFailed}
              onClick={() => answer(option)}
            >
              {option}
            </button>
          );
        })}
      </div>

      {revealed ? (
        <div className="change__reveal">
          <p className="change__reveal-head">
            <strong>{picked === current.answer ? "Right. " : "Not quite. "}</strong>
            {current.site.name}, {current.site.country}
          </p>
          <p className="change__reveal-why">{current.site.because}</p>
          <p className="change__source">Source: {current.site.source}</p>
        </div>
      ) : (
        <p className="change__reveal change__reveal--empty">&nbsp;</p>
      )}
    </section>
  );
}
