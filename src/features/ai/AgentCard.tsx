import { useAiStore } from "@/stores/aiStore";
import { useLocationStore } from "@/stores/locationStore";
import { runAgent } from "@/services/ai";
import { ApiUnavailableError } from "@/services/apiClient";
import { formatAiText } from "@/lib/formatAiText";
import { aiAttribution } from "@/lib/formatAiMeta";
import { agentSubject, stalenessNotice } from "./agentSubject";
import type { AgentDefinition, CopilotContext } from "@/types/ai";
import "./AgentCard.css";

export function AgentCard({ definition, context }: { definition: AgentDefinition; context: CopilotContext }) {
  const run = useAiStore((s) => s.agentRuns[definition.kind]);
  const setAgentRun = useAiStore((s) => s.setAgentRun);
  const location = useLocationStore((s) => s.selectedLocation);

  const subject = agentSubject(location);
  const stale = run.status === "done" ? stalenessNotice(run.subject, subject) : null;

  const handleRun = async () => {
    // Queued until the AI request gate actually lets this one out — see
    // src/services/aiRequestQueue.ts. onStart is what flips it to "running",
    // so the card never claims to be running while it's really still waiting.
    setAgentRun(definition.kind, { status: "queued", subject });
    try {
      const result = await runAgent(definition.kind, context, undefined, () =>
        setAgentRun(definition.kind, { status: "running", subject })
      );
      // `subject` is the one captured above, at click time — the place this
      // request was actually about. See aiStore.ts.
      setAgentRun(definition.kind, { status: "done", result, subject });
    } catch (error) {
      const message = error instanceof ApiUnavailableError ? error.message : "This agent hit an unexpected problem. Please try again.";
      setAgentRun(definition.kind, { status: "error", error: message, subject });
    }
  };

  return (
    <div className={`agent-card agent-card--${run.status}`}>
      <div className="agent-card__head">
        <span className="agent-card__icon" aria-hidden="true">
          {definition.icon}
        </span>
        <strong>{definition.label}</strong>
      </div>
      <p className="agent-card__description">{definition.description}</p>

      {run.status === "idle" &&
        (location ? (
          <button type="button" onClick={handleRun}>
            Run
          </button>
        ) : (
          /*
            Every agent reads the same "current location data" block, and with
            nothing selected that block is the single line "No location is
            currently selected in the app." So the button used to spend a
            provider request — out of a budget of 15 a minute shared by all
            six cards and Ask maNOWj — to be told what the card can say for
            free. Say it here instead.
          */
          <span className="agent-card__status">Pick a place on the map first.</span>
        ))}
      {run.status === "queued" && (
        <span className="agent-card__status">
          <span className="async-panel__spinner" aria-hidden="true" /> Queued…
        </span>
      )}
      {run.status === "running" && (
        <span className="agent-card__status">
          <span className="async-panel__spinner" aria-hidden="true" /> Running…
        </span>
      )}
      {run.status === "error" && (
        <>
          <p className="agent-card__error">{run.error}</p>
          <button type="button" onClick={handleRun} disabled={!location}>
            Retry
          </button>
        </>
      )}
      {run.status === "done" && run.result && (
        <>
          {/*
            The answer is kept, not discarded — you may still want to read it.
            It is just no longer allowed to present itself as a description of
            what is on screen.
          */}
          {stale && <p className="agent-card__stale">{stale}</p>}
          <p className="agent-card__result">{formatAiText(run.result.summary)}</p>
          {run.result.sources.length > 0 && <span className="agent-card__sources">Sources: {run.result.sources.join(", ")}</span>}
          {/*
            Who wrote this, and when. The server used to report the model slug
            it REQUESTED, and no component rendered even that — so an AI answer
            was the only thing in this product that arrived with no source and
            no date, in the one place a reader can least check it themselves.
          */}
          <span className="agent-card__attribution">{aiAttribution(run.result.model, run.result.generatedAt)}</span>
          {/*
            A stale notice with no way to act on it is just a complaint, so
            the button names the fix. "Run for <name>" was the first version
            and it read well until a place was called "Chhatrapati Shivaji
            Maharaj International Airport", which truncated to "Run for
            Chhatra…" in a 160px card — a label that says less than nothing.
            The notice directly above already names the place, so the button
            only has to supply the verb. Disabled with nothing selected, for
            the same reason the idle card has no Run button at all.
          */}
          <button type="button" className="agent-card__rerun" onClick={handleRun} disabled={!location}>
            {stale && location ? "Run for this place" : "Run again"}
          </button>
        </>
      )}
    </div>
  );
}
