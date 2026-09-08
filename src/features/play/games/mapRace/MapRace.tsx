import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameMap } from "../../components/GameMap";
import { RoundSummary } from "../../components/RoundSummary";
import { usePlayStore } from "../../progress/playStore";
import type { AppliedRound } from "../../progress/applyRound";
import { PLACES, haversineKm, type Place } from "../../data/world";
import { createRng } from "../../lib/random";
import { formatDistanceKm } from "../pin/pinScoring";
import { playTone } from "../../sound";

const DURATION_SECONDS = 60;
/** How close counts as finding it. Generous — this is a speed game. */
const HIT_RADIUS_KM = 500;

interface Hit {
  place: Place;
  distanceKm: number;
  found: boolean;
}

/**
 * Map Race — sixty seconds, one place at a time, find as many as you can.
 *
 * A miss costs you nothing but the seconds it took, which is what keeps the
 * game moving: hesitating is the real penalty, not being wrong. The hit
 * radius is deliberately loose (500 km) because at this speed you're aiming
 * at a country, not a street.
 */
export function MapRace({ onBackToHub }: { onBackToHub: () => void }) {
  const [nonce, setNonce] = useState(0);
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [secondsLeft, setSecondsLeft] = useState(DURATION_SECONDS);
  const [index, setIndex] = useState(0);
  const [hits, setHits] = useState<Hit[]>([]);
  const [flash, setFlash] = useState<null | { found: boolean; distanceKm: number }>(null);
  const [applied, setApplied] = useState<AppliedRound | null>(null);

  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const recordedRef = useRef(false);
  const flashTimer = useRef<number | null>(null);

  // A long queue so a fast player never runs out inside a minute.
  const queue = useMemo(() => createRng(`race-${nonce}`).shuffle(PLACES).slice(0, 40), [nonce]);
  const place = queue[index];

  const finish = useCallback(() => {
    setPhase("done");
  }, []);

  // The clock. One interval, cleared on unmount and when the round ends —
  // a timer that outlives the component is how a game keeps "playing" in the
  // background after you close it.
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          finish();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, finish]);

  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current); }, []);

  useEffect(() => {
    if (phase !== "done" || recordedRef.current) return;
    recordedRef.current = true;
    const found = hits.filter((h) => h.found).length;
    setApplied(
      recordRound({
        gameId: "map-race",
        // Score IS the number found — a straightforward number people can
        // compare and beat, rather than a weighted figure nobody can predict.
        score: found,
        outcome: "complete",
      })
    );
  }, [phase, hits, recordRound]);

  const start = () => {
    recordedRef.current = false;
    setNonce((n) => n + 1);
    setPhase("running");
    setSecondsLeft(DURATION_SECONDS);
    setIndex(0);
    setHits([]);
    setFlash(null);
    setApplied(null);
  };

  const pick = (lat: number, lon: number) => {
    if (phase !== "running" || !place) return;
    const distanceKm = haversineKm(lat, lon, place.lat, place.lon);
    const found = distanceKm <= HIT_RADIUS_KM;
    setHits((h) => [...h, { place, distanceKm, found }]);
    setFlash({ found, distanceKm });
    setIndex((i) => i + 1);
    if (soundEnabled) playTone(found ? 720 : 220, 0.07);

    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 900);
  };

  if (phase === "ready") {
    return (
      <div className="game game--race">
        <div className="play-intro">
          <p className="play-intro__title">60 seconds. How many can you find?</p>
          <p className="play-intro__body">
            A place name appears. Click roughly where it is on the map. Anything within{" "}
            {HIT_RADIUS_KM} km counts. Wrong answers cost you nothing but time — keep moving.
          </p>
          <button type="button" className="play-btn play-btn--primary" onClick={start}>
            Start the clock
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const found = hits.filter((h) => h.found).length;
    return (
      <div className="game">
        <RoundSummary
          gameTitle="Map Race"
          headline={`${found} found in ${DURATION_SECONDS} seconds`}
          detail={hits.length > 0 ? `${hits.length} attempts` : "No attempts — the clock ran out."}
          score={found}
          applied={applied}
          lines={hits.slice(0, 12).map((h) => `${h.found ? "✅" : "❌"} ${h.place.name} — ${formatDistanceKm(h.distanceKm)}`)}
          onPlayAgain={start}
          onBackToHub={onBackToHub}
        />
      </div>
    );
  }

  return (
    <div className="game game--race">
      <div className="play-roundbar">
        <span className={secondsLeft <= 10 ? "play-roundbar__urgent" : ""}>⏱ {secondsLeft}s</span>
        <span>{hits.filter((h) => h.found).length} found</span>
      </div>

      <p className="play-prompt">
        Find <strong>{place?.name}</strong>
        <span className="play-prompt__hint"> ({place?.country})</span>
      </p>

      <div className="play-map-wrap">
        <GameMap
          style="world"
          center={[0, 20]}
          zoom={0.7}
          interactive
          onPick={pick}
          pins={[]}
          ariaLabel={`World map — click where ${place?.name ?? "the place"} is`}
        />
        {flash && (
          <div className={`play-flash ${flash.found ? "play-flash--hit" : "play-flash--miss"}`} role="status">
            {flash.found ? "Found it" : `${formatDistanceKm(flash.distanceKm)} off`}
          </div>
        )}
      </div>

      <button type="button" className="play-btn play-btn--quiet" onClick={finish}>
        Stop early
      </button>
    </div>
  );
}
