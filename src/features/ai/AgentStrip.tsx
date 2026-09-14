import { AGENT_DEFINITIONS } from "@/types/ai";
import { useLocationStore } from "@/stores/locationStore";
import { useCopilotContext } from "./useCopilotContext";
import { AgentCard } from "./AgentCard";
import "./AgentStrip.css";

/**
 * The six AI agent cards, in the workspace panel's "Ask" section (🤖 on the
 * rail), below Ask maNOWj and the report.
 *
 * This is the only place they render. Two earlier arrangements are gone and
 * the comment here described both of them: a full grid in an Intelligence
 * panel "AI Agents" tab (removed — see IntelligencePanel.tsx), and a strip
 * below the map (removed because it sat under the page fold, where in
 * practice nobody found it — see AgentStrip.css). A comment pointing at
 * features that no longer exist is worse than no comment: the Help & Guide
 * was still telling people to "scroll below the map" to find these.
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
