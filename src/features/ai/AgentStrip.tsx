import { AGENT_DEFINITIONS } from "@/types/ai";
import { useLocationStore } from "@/stores/locationStore";
import { useCopilotContext } from "./useCopilotContext";
import { AgentCard } from "./AgentCard";
import "./AgentStrip.css";

/**
 * A persistent, always-visible row of AI agent cards directly below the map
 * — so running an agent never requires finding the "AI Agents" tab first.
 * Shares the same AgentCard/useCopilotContext as AgentCenter (the full grid
 * still lives in the Intelligence panel's "AI Agents" tab for a larger,
 * side-by-side view); this is the same six agents, just surfaced somewhere
 * they're immediately visible and usable without extra navigation.
 */
export function AgentStrip() {
  const location = useLocationStore((s) => s.selectedLocation);
  const context = useCopilotContext();

  return (
    <div className="agent-strip">
      <div className="agent-strip__head">
        <strong>AI Agents</strong>
        <span className="agent-strip__hint">
          {location ? `${AGENT_DEFINITIONS.length} agents — scroll down for all of them` : "Select a location on the map to run them."}
        </span>
      </div>
      <div className="agent-strip__row">
        {AGENT_DEFINITIONS.map((def) => (
          <div className="agent-strip__item" key={def.kind}>
            <AgentCard definition={def} context={context} />
          </div>
        ))}
      </div>
    </div>
  );
}
