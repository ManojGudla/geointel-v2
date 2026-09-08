import { useAiStore } from "@/stores/aiStore";
import { runAgent } from "@/services/ai";
import { ApiUnavailableError } from "@/services/apiClient";
import { formatAiText } from "@/lib/formatAiText";
import type { AgentDefinition, CopilotContext } from "@/types/ai";
import "./AgentCard.css";

export function AgentCard({ definition, context }: { definition: AgentDefinition; context: CopilotContext }) {
  const run = useAiStore((s) => s.agentRuns[definition.kind]);
  const setAgentRun = useAiStore((s) => s.setAgentRun);

  const handleRun = async () => {
    // Queued until the AI request gate actually lets this one out — see
    // src/services/aiRequestQueue.ts. onStart is what flips it to "running",
    // so the card never claims to be running while it's really still waiting.
    setAgentRun(definition.kind, { status: "queued" });
    try {
      const result = await runAgent(definition.kind, context, undefined, () => setAgentRun(definition.kind, { status: "running" }));
      setAgentRun(definition.kind, { status: "done", result });
    } catch (error) {
      const message = error instanceof ApiUnavailableError ? error.message : "This agent hit an unexpected problem. Please try again.";
      setAgentRun(definition.kind, { status: "error", error: message });
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

      {run.status === "idle" && (
        <button type="button" onClick={handleRun}>
          Run
        </button>
      )}
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
          <button type="button" onClick={handleRun}>
            Retry
          </button>
        </>
      )}
      {run.status === "done" && run.result && (
        <>
          <p className="agent-card__result">{formatAiText(run.result.summary)}</p>
          {run.result.sources.length > 0 && <span className="agent-card__sources">Sources: {run.result.sources.join(", ")}</span>}
          <button type="button" className="agent-card__rerun" onClick={handleRun}>
            Run again
          </button>
        </>
      )}
    </div>
  );
}
