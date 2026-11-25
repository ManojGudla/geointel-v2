import { useState } from "react";
import { useLocationStore } from "@/stores/locationStore";
import { useAnalysisStore } from "@/stores/analysisStore";
import { buildTripPlan } from "@/services/ai";
import type { TripPlan, TripStop } from "@/types/ai";
import { useAgentAnchor } from "./agentAnchor";
import { EvidenceList } from "./AgentEvidence";
import { describeAiFailure } from "./aiErrors";
import "./TripBuilder.css";

const INTERESTS: Array<{ key: string; label: string }> = [
  { key: "attractions", label: "Sights" },
  { key: "restaurants", label: "Restaurants" },
  { key: "cafes", label: "Cafes" },
  { key: "parks", label: "Parks" },
  { key: "shopping", label: "Shops" },
];

const CATEGORY_LABEL: Record<string, string> = { attractions: "Sight", restaurants: "Restaurant", cafes: "Cafe", parks: "Park", shopping: "Shop", custom: "Stop" };
const MODE_LABEL = { car: "by car", walk: "on foot", bike: "by bike" } as const;

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

function distance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1).replace(/\.0$/, "")} km`;
}

type State = { status: "idle" } | { status: "running" } | { status: "done"; plan: TripPlan } | { status: "error"; error: string };

/**
 * Make My Trip as a planner, not a chat: pick interests, days and how you
 * travel, get named mapped places in a nearest-next order with every hop
 * measured by the routing provider, then reorder or remove stops and
 * re-measure. Time at each stop is the app's stated assumption. It never
 * shows prices or claims a booking.
 */
export function TripBuilder() {
  const anchor = useAgentAnchor();
  const location = useLocationStore((s) => s.selectedLocation);
  const setAnalysis = useAnalysisStore((s) => s.setResult);
  const [interests, setInterests] = useState<string[]>(["attractions", "restaurants", "parks"]);
  const [days, setDays] = useState(1);
  const [stopsPerDay, setStopsPerDay] = useState(3);
  const [mode, setMode] = useState<"car" | "walk" | "bike">("car");
  const [state, setState] = useState<State>({ status: "idle" });
  /** The stops as the visitor has arranged them; differs from the plan after an edit. */
  const [edited, setEdited] = useState<TripStop[] | null>(null);

  const plan = state.status === "done" ? state.plan : null;
  const planStops: TripStop[] = plan ? plan.days.flatMap((d) => d.stops.map(({ name, category, lat, lon }) => ({ name, category, lat, lon }))) : [];
  const stops = edited ?? planStops;

  const run = async (ownStops?: TripStop[]) => {
    if (!anchor) return;
    setState({ status: "running" });
    try {
      const next = await buildTripPlan(anchor, { interests, days, stopsPerDay, mode, stops: ownStops });
      setEdited(null);
      setState({ status: "done", plan: next });
    } catch (error) {
      setState({ status: "error", error: describeAiFailure(error) });
    }
  };

  const move = (index: number, by: -1 | 1) => {
    const next = [...stops];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    setEdited(next);
  };

  const remove = (index: number) => setEdited(stops.filter((_, i) => i !== index));

  const showOnMap = (p: TripPlan) => {
    if (!location) return;
    const numbered = p.days.flatMap((d) => d.stops);
    setAnalysis({
      kind: "trip",
      title: `Trip plan: ${p.days.length} day${p.days.length === 1 ? "" : "s"}, ${numbered.length} stops`,
      origin: { lat: location.lat, lon: location.lon },
      points: numbered.map((s, i) => ({ id: `trip-${i}`, lat: s.lat, lon: s.lon, label: `${i + 1}. ${s.name}`, distanceMeters: s.leg?.distanceMeters ?? 0 })),
      paths: p.days.map((d) => [[location.lon, location.lat] as [number, number], ...d.stops.map((s) => [s.lon, s.lat] as [number, number])]),
      stats: p.days.map((d) => ({ label: `Day ${d.day}`, value: `${d.stops.length} stops, about ${duration(d.totalMinutes)}` })),
      note: "Stops: OpenStreetMap. Lines join the stops in order (each day starts at the selected place); travel times come from the routing provider. Time at each stop is this app's assumption.",
    });
  };

  return (
    <details className="trip-builder">
      <summary>
        <span aria-hidden="true">🧭</span> Make My Trip: build a day-by-day plan
      </summary>
      {!location ? (
        <p className="trip-builder__hint">Search a place or tap the map first. The trip starts there.</p>
      ) : (
        <form
          className="trip-builder__form"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <fieldset>
            <legend>Interests</legend>
            {INTERESTS.map((i) => (
              <label key={i.key}>
                <input
                  type="checkbox"
                  checked={interests.includes(i.key)}
                  onChange={(e) => setInterests(e.target.checked ? [...interests, i.key] : interests.filter((k) => k !== i.key))}
                />{" "}
                {i.label}
              </label>
            ))}
          </fieldset>
          <div className="trip-builder__row">
            <label>
              Days{" "}
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stops a day{" "}
              <select value={stopsPerDay} onChange={(e) => setStopsPerDay(Number(e.target.value))}>
                {[2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Travel{" "}
              <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="car">Car</option>
                <option value="walk">Walk</option>
                <option value="bike">Bike</option>
              </select>
            </label>
          </div>
          <button type="submit" disabled={!interests.length || state.status === "running"}>
            {plan ? "Build a new plan" : "Build plan"}
          </button>
        </form>
      )}

      {state.status === "running" && (
        <p className="trip-builder__hint" role="status">
          <span className="async-panel__spinner" aria-hidden="true" /> Finding places and measuring each hop…
        </p>
      )}
      {state.status === "error" && (
        <p className="trip-builder__error" role="alert">
          {state.error}
        </p>
      )}

      {plan && (
        <div className="trip-builder__plan">
          <p className="trip-builder__hint">
            {plan.order === "yours" ? "Your order of stops, re-measured." : "Stops in nearest-next order from the selected place."} Each day starts at the selected place, {MODE_LABEL[plan.mode]}.
          </p>

          {edited ? (
            <ol className="trip-builder__edit">
              {stops.map((s, i) => (
                <li key={`${s.name}-${i}`}>
                  <span>
                    {i + 1}. {s.name}
                  </span>
                  <span className="trip-builder__buttons">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${s.name} earlier`}>
                      ↑
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === stops.length - 1} aria-label={`Move ${s.name} later`}>
                      ↓
                    </button>
                    <button type="button" onClick={() => remove(i)} disabled={stops.length === 1} aria-label={`Remove ${s.name}`}>
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            plan.days.map((d) => (
              <section key={d.day} className="trip-builder__day" aria-label={`Day ${d.day}`}>
                <h4>
                  Day {d.day} · about {duration(d.totalMinutes)}
                </h4>
                <ol>
                  {d.stops.map((s, i) => (
                    <li key={`${s.name}-${i}`}>
                      <span className="trip-builder__leg">
                        {s.leg ? `↳ ${distance(s.leg.distanceMeters)}, about ${s.leg.minutes} min (${s.leg.source})` : "↳ travel time unknown"}
                      </span>
                      <strong>{s.name}</strong> <span className="trip-builder__meta">{CATEGORY_LABEL[s.category] ?? "Stop"} · {s.visitMinutes} min (assumed)</span>
                    </li>
                  ))}
                </ol>
                {d.warnings.length > 0 && (
                  <ul className="trip-builder__warnings">
                    {d.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}

          <div className="trip-builder__actions">
            {edited ? (
              <>
                <button type="button" onClick={() => void run(edited)} disabled={state.status === "running"}>
                  Re-measure my order
                </button>
                <button type="button" className="trip-builder__secondary" onClick={() => setEdited(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setEdited(planStops)} disabled={planStops.length === 0}>
                  Reorder or remove stops
                </button>
                <button type="button" className="trip-builder__secondary" onClick={() => showOnMap(plan)} disabled={planStops.length === 0}>
                  Show on the map
                </button>
              </>
            )}
          </div>

          <ul className="trip-builder__assumptions">
            {plan.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          {plan.evidence.length > 0 && (
            <details className="agent-evidence__details">
              <summary>Evidence ({plan.evidence.length})</summary>
              <EvidenceList items={plan.evidence} />
            </details>
          )}
        </div>
      )}
    </details>
  );
}
