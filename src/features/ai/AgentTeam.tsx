import { useId, useState, type FormEvent } from "react";
import { useLocationStore } from "@/stores/locationStore";
import { useRouteStore } from "@/stores/routeStore";
import { askAgentTeam } from "@/services/ai";
import { aiAttribution } from "@/lib/formatAiMeta";
import { AGENT_DEFINITIONS, type AgentKind, type TeamResult } from "@/types/ai";
import { useAgentAnchor } from "./agentAnchor";
import { EvidenceList, Findings, removedNotice } from "./AgentEvidence";
import { describeAiFailure } from "./aiErrors";
import "./AgentTeam.css";

const EXAMPLES = [
  "Evaluate this place for a family home and plan a route to the nearest hospital",
  "Analyse the area within 1 km of here",
  "What's the weather like for a visit, and what's nearby?",
  "Plan a day around here",
];

const CONFIDENCE = { high: "High", medium: "Medium", low: "Low", insufficient: "Not enough data" } as const;

function definitionOf(kind: AgentKind) {
  return AGENT_DEFINITIONS.find((d) => d.kind === kind)!;
}

function seconds(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

type TeamState = { status: "idle" } | { status: "running"; request: string } | { status: "done"; result: TeamResult } | { status: "error"; error: string };

/**
 * Ask several agents one thing.
 *
 * Nothing here is staged: while the request runs, the screen says only that
 * it is running, because the server does the work in one request and there
 * is no honest way to show its steps live. When it answers, the timeline
 * lists the steps it actually took, with their real times, and each section
 * names the agent that wrote it.
 */
export function AgentTeam() {
  const anchor = useAgentAnchor();
  const location = useLocationStore((s) => s.selectedLocation);
  const setFrom = useRouteStore((s) => s.setFrom);
  const setMode = useRouteStore((s) => s.setMode);
  const openPanel = useRouteStore((s) => s.openPanel);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<TeamState>({ status: "idle" });
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const listId = useId();

  const run = async (request: string) => {
    const text = request.trim();
    if (!text || !anchor || state.status === "running") return;
    setState({ status: "running", request: text });
    setHighlight(null);
    setOpen(false);
    try {
      const result = await askAgentTeam(text, anchor);
      setState({ status: "done", result });
      // With no written answer the evidence IS the result, so it opens.
      if (result.aiUnavailable) setOpen(true);
    } catch (error) {
      setState({ status: "error", error: describeAiFailure(error) });
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(draft);
  };

  const cite = (id: string) => {
    setOpen(true);
    setHighlight(id);
  };

  const showRoute = (route: NonNullable<TeamResult["route"]>) => {
    if (location) setFrom(location);
    setMode(route.mode);
    openPanel({ lat: route.lat, lon: route.lon, name: route.name, displayName: route.name });
  };

  const result = state.status === "done" ? state.result : null;
  const removed = removedNotice(result?.removedSentences);

  return (
    <section className="agent-team" aria-labelledby={`${listId}-title`}>
      <h3 className="agent-team__title" id={`${listId}-title`}>
        Ask the agents together
      </h3>
      <p className="agent-team__hint">
        {location
          ? "One request, several agents. Each answer names the agent that wrote it and the evidence behind it."
          : "Search a place or tap the map first. The agents work on the selected place."}
      </p>

      <form className="agent-team__form" onSubmit={submit}>
        <label className="visually-hidden" htmlFor={`${listId}-input`}>
          What should the agents do?
        </label>
        <input
          id={`${listId}-input`}
          type="text"
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Is this good for a family home? Route to the nearest hospital"
          disabled={!location}
        />
        <button type="submit" disabled={!location || !draft.trim() || state.status === "running"}>
          Ask
        </button>
      </form>

      {location && state.status === "idle" && (
        <div className="agent-team__examples">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setDraft(example);
                void run(example);
              }}
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {state.status === "running" && (
        <p className="agent-team__status" role="status">
          <span className="async-panel__spinner" aria-hidden="true" /> Fetching the evidence and writing the report. This can take up to 40 seconds.
        </p>
      )}

      {state.status === "error" && (
        <p className="agent-team__error" role="alert">
          {state.error}
        </p>
      )}

      {result && (
        <div className="agent-team__result">
          <p className="agent-team__understood">
            <strong>Understood:</strong> {result.understood}
          </p>
          <ul className="agent-team__agents" aria-label="Agents involved">
            {result.agents.map((kind) => (
              <li key={kind}>
                <span aria-hidden="true">{definitionOf(kind).icon}</span> {definitionOf(kind).label}
              </li>
            ))}
          </ul>

          {result.aiUnavailable && (
            <p className="agent-evidence__unavailable" role="status">
              {result.aiUnavailable} The facts the agents checked are in the evidence list below.
            </p>
          )}

          <details className="agent-evidence__details" open>
            <summary>What the agents did</summary>
            <ol className="agent-evidence__steps">
              {result.steps.map((step, i) => (
                <li key={i} className={`agent-evidence__step agent-evidence__step--${step.status}`}>
                  {step.step}: {step.status === "ok" ? "done" : step.status === "partial" ? "partly done" : "failed"}
                  {step.ms > 0 ? `, ${seconds(step.ms)}` : ""}
                </li>
              ))}
            </ol>
          </details>

          {result.sections.map((section) => (
            <article key={section.agent} className="agent-team__section">
              <h4>
                <span aria-hidden="true">{definitionOf(section.agent).icon}</span> {definitionOf(section.agent).label}
              </h4>
              <p className={`agent-evidence__confidence agent-evidence__confidence--${section.confidence.level}`}>
                <strong>Confidence: {CONFIDENCE[section.confidence.level]}.</strong> {section.confidence.reason}
              </p>
              {section.findings.length ? <Findings findings={section.findings} onCite={cite} listId={listId} /> : <p className="agent-card__result">{section.summary}</p>}
            </article>
          ))}

          {removed && <p className="agent-evidence__removed">{removed}</p>}

          {result.route && (
            <button type="button" className="agent-team__route" onClick={() => showRoute(result.route!)}>
              Show the route to {result.route.name} on the map
            </button>
          )}

          <details className="agent-evidence__details" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
            <summary>Evidence ({result.evidence.length})</summary>
            <EvidenceList items={result.evidence} highlight={highlight} id={listId} />
          </details>

          <span className="agent-card__attribution">{aiAttribution(result.model, result.generatedAt)}</span>
        </div>
      )}
    </section>
  );
}
