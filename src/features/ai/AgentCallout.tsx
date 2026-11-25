import { AGENT_DEFINITIONS } from "@/types/ai";
import { useShellStore } from "@/stores/shellStore";
import "./AgentCallout.css";

/**
 * A one-line pointer to the AI agents, at the top of a place's Overview.
 *
 * The agents only render in the AI section, and people who select a place
 * land here, in Explore. Nothing on this screen said the agents existed, so
 * the feature that explains a place in plain words was the one hardly anyone
 * found. This does not run anything itself: it says what is available and
 * takes you there in one tap, where the agents already have the place loaded.
 */
export function AgentCallout() {
  const openSection = useShellStore((s) => s.openSection);

  return (
    <section className="agent-callout" aria-label="AI agents for this place">
      <span className="agent-callout__icons" aria-hidden="true">
        {AGENT_DEFINITIONS.slice(0, 3).map((agent) => (
          <span key={agent.kind}>{agent.icon}</span>
        ))}
      </span>
      <p className="agent-callout__text">
        <strong>{AGENT_DEFINITIONS.length} AI agents can explain this place</strong>
        <span>The area, the property, getting here and a day plan.</span>
      </p>
      <button type="button" className="agent-callout__go" onClick={() => openSection("ai")}>
        Open
      </button>
    </section>
  );
}
