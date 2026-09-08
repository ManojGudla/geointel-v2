import { useEffect, useMemo, useState } from "react";
import { useGamesStore } from "@/stores/gamesStore";
import { usePlayStore } from "./progress/playStore";
import { levelProgress } from "./progress/xp";
import { ACHIEVEMENTS } from "./progress/achievements";
import { CATEGORIES, GAMES, findGame, type CategoryId } from "./registry";
import { dailyChallengeFor, friendlyDate, renderDaily } from "./daily";
import { localDateKey } from "./lib/random";
import "./PlayHub.css";

type View = { kind: "hub" } | { kind: "game"; id: string } | { kind: "daily" } | { kind: "profile" };

/**
 * maNOWj PLAY — the games section.
 *
 * It lives behind the header's More menu, deliberately not on the workspace
 * rail. The rail is the analyst's tool set; a game sitting between "Analyze"
 * and "Intelligence" would say the wrong thing about what this product is.
 * Opening it doesn't touch the map, the layers or any analysis — closing it
 * puts you back exactly where you were.
 */
export function PlayHub() {
  const isOpen = useGamesStore((s) => s.isOpen);
  const close = useGamesStore((s) => s.close);
  const requestedGame = useGamesStore((s) => s.activeGame);
  const clearRequested = useGamesStore((s) => s.backToHub);

  const [view, setView] = useState<View>({ kind: "hub" });
  const [category, setCategory] = useState<CategoryId | "all">("all");

  const stats = usePlayStore((s) => s.stats);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const setSoundEnabled = usePlayStore((s) => s.setSoundEnabled);

  const today = localDateKey();
  const daily = useMemo(() => dailyChallengeFor(today), [today]);
  const dailyDone = stats.lastDailyDate === today;

  // The header/command palette can ask for a specific game by id.
  useEffect(() => {
    if (!isOpen) return;
    if (requestedGame && findGame(requestedGame)) setView({ kind: "game", id: requestedGame });
  }, [isOpen, requestedGame]);

  const backToHub = () => {
    clearRequested();
    setView({ kind: "hub" });
  };

  // Escape steps back one level — out of a game to the hub, out of the hub to
  // the map — rather than dumping you all the way out in one press.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (view.kind === "hub") close();
      else backToHub();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, view.kind, close]);

  useEffect(() => {
    if (!isOpen) {
      setView({ kind: "hub" });
      setCategory("all");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const progress = levelProgress(stats.xp);
  const unlockedCount = stats.unlocked.length;
  const shown = category === "all" ? GAMES : GAMES.filter((g) => g.categories.includes(category));

  const activeGame = view.kind === "game" ? findGame(view.id) : undefined;

  const subtitle = () => {
    if (view.kind === "daily") return daily.description;
    if (activeGame) return activeGame.tagline;
    if (view.kind === "profile") return "Everything you've earned, kept on this device.";
    return "Take a break. Your map, layers and analysis stay exactly as you left them.";
  };

  return (
    <div className="play" role="dialog" aria-modal="true" aria-label="maNOWj PLAY">
      <div className="play__sheet">
        <header className="play__head">
          <div className="play__title">
            <h2>
              <span aria-hidden="true">🎮</span> maNOWj PLAY
            </h2>
            <p>{subtitle()}</p>
          </div>
          <div className="play__head-actions">
            {view.kind !== "hub" && (
              <button type="button" className="play__back" onClick={backToHub}>
                ← All games
              </button>
            )}
            <button
              type="button"
              className="play__icon-btn"
              onClick={() => setSoundEnabled(!soundEnabled)}
              aria-pressed={soundEnabled}
              title={soundEnabled ? "Sound on — click to mute" : "Sound off — click to unmute"}
            >
              {soundEnabled ? "🔊" : "🔇"}
            </button>
            <button type="button" className="play__icon-btn" onClick={close} aria-label="Close games and return to the map">
              ✕
            </button>
          </div>
        </header>

        <div className="play__body">
          {view.kind === "game" && activeGame && activeGame.render({ onBackToHub: backToHub })}
          {view.kind === "daily" && renderDaily(daily, backToHub)}
          {view.kind === "profile" && <Profile />}

          {view.kind === "hub" && (
            <>
              {/* Progress strip: level, streak, achievements. Every number
                  here came from a round that was actually played. */}
              <button type="button" className="play-profile-strip" onClick={() => setView({ kind: "profile" })}>
                <span className="play-profile-strip__level">
                  <strong>Level {progress.level}</strong>
                  <span className="play-profile-strip__bar">
                    <span style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
                  </span>
                  <span className="play-profile-strip__xp">{progress.xpToNext} XP to next</span>
                </span>
                <span className="play-profile-strip__stat">
                  🔥 <strong>{stats.currentStreak}</strong> day{stats.currentStreak === 1 ? "" : "s"}
                </span>
                <span className="play-profile-strip__stat">
                  🏆 <strong>{unlockedCount}</strong>/{ACHIEVEMENTS.length}
                </span>
              </button>

              <section className="play-daily">
                <div className="play-daily__text">
                  <span className="play-daily__label">Daily Challenge · {friendlyDate(daily.date)}</span>
                  <strong>{daily.title}</strong>
                  <p>{daily.description}</p>
                </div>
                {/* Not "Play again": the Daily is deliberately one run a day,
                    and the game refuses a second. A button promising a replay
                    it will not give is worse than no button. */}
                <button type="button" className="play-btn play-btn--primary" onClick={() => setView({ kind: "daily" })}>
                  {dailyDone ? "See today's result" : "Play today's"}
                </button>
                {dailyDone && <span className="play-daily__done">Done today ✓</span>}
              </section>

              <nav className="play-categories" aria-label="Game categories">
                <button type="button" className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>
                  All ({GAMES.length})
                </button>
                {CATEGORIES.map((c) => {
                  const count = GAMES.filter((g) => g.categories.includes(c.id)).length;
                  if (count === 0) return null;
                  return (
                    <button key={c.id} type="button" className={category === c.id ? "active" : ""} onClick={() => setCategory(c.id)}>
                      <span aria-hidden="true">{c.icon}</span> {c.label} ({count})
                    </button>
                  );
                })}
              </nav>

              <div className="play-grid">
                {shown.map((game) => {
                  const gameStats = stats.games[game.id];
                  return (
                    <article key={game.id} className="play-card">
                      <div className="play-card__icon" aria-hidden="true">
                        {game.icon}
                      </div>
                      <h3>{game.title}</h3>
                      <p>{game.tagline}</p>
                      <div className="play-card__meta">
                        <span>{game.duration}</span>
                        {gameStats && gameStats.rounds > 0 && (
                          <span>
                            {game.scored ? `Best ${gameStats.bestScore.toLocaleString()}` : `${gameStats.wins}W`} ·{" "}
                            {gameStats.rounds} played
                          </span>
                        )}
                      </div>
                      <button type="button" className="play-btn play-btn--primary" onClick={() => setView({ kind: "game", id: game.id })}>
                        Play
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {view.kind === "hub" && (
          <footer className="play__foot">
            Every game here is playable now — there are no locked cards. Scores, streaks and achievements are saved in this
            browser only; there is no account and no global leaderboard, so nothing here is compared against other players.
          </footer>
        )}
      </div>
    </div>
  );
}

/** The profile view: personal bests per game, and the achievement wall. */
function Profile() {
  const stats = usePlayStore((s) => s.stats);
  const reset = usePlayStore((s) => s.reset);
  const [confirming, setConfirming] = useState(false);
  const progress = levelProgress(stats.xp);
  const played = GAMES.filter((g) => (stats.games[g.id]?.rounds ?? 0) > 0);

  return (
    <div className="play-profile">
      <div className="play-profile__hero">
        <strong>Level {progress.level}</strong>
        <span>
          {stats.xp.toLocaleString()} XP · {progress.xpToNext} to level {progress.level + 1}
        </span>
        <span className="play-profile-strip__bar">
          <span style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
        </span>
      </div>

      <dl className="play-profile__figures">
        <div>
          <dt>Current streak</dt>
          <dd>{stats.currentStreak}</dd>
        </div>
        <div>
          <dt>Longest streak</dt>
          <dd>{stats.longestStreak}</dd>
        </div>
        <div>
          <dt>Dailies done</dt>
          <dd>{stats.dailyCompleted}</dd>
        </div>
        <div>
          <dt>Games played</dt>
          <dd>{played.length}</dd>
        </div>
      </dl>

      <h4>Personal bests</h4>
      {played.length === 0 ? (
        <p className="play-empty">Nothing yet — finish a round and it shows up here.</p>
      ) : (
        <ul className="play-profile__bests">
          {played.map((g) => {
            const s = stats.games[g.id]!;
            return (
              <li key={g.id}>
                <span>
                  <span aria-hidden="true">{g.icon}</span> {g.title}
                </span>
                <strong>
                  {g.scored ? s.bestScore.toLocaleString() : `${s.wins}W / ${s.losses}L / ${s.draws}D`}
                </strong>
                <span className="play-profile__rounds">{s.rounds} played</span>
              </li>
            );
          })}
        </ul>
      )}

      <h4>
        Achievements ({stats.unlocked.length}/{ACHIEVEMENTS.length})
      </h4>
      <ul className="play-achievements">
        {ACHIEVEMENTS.map((a) => {
          const got = stats.unlocked.includes(a.id);
          return (
            <li key={a.id} className={got ? "unlocked" : "locked"}>
              <span aria-hidden="true">{got ? a.icon : "🔒"}</span>
              <span>
                <strong>{a.title}</strong>
                <em>{a.requirement}</em>
              </span>
            </li>
          );
        })}
      </ul>

      {/* Destructive, so it asks — and it says exactly what goes. */}
      <div className="play-profile__reset">
        {confirming ? (
          <>
            <span>Erase all scores, streaks and achievements on this device?</span>
            <button
              type="button"
              className="play-btn"
              onClick={() => {
                reset();
                setConfirming(false);
              }}
            >
              Yes, erase
            </button>
            <button type="button" className="play-btn play-btn--quiet" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="play-btn play-btn--quiet" onClick={() => setConfirming(true)}>
            Reset my progress
          </button>
        )}
      </div>
    </div>
  );
}
