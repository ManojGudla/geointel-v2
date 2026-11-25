import { AGENT_DEFINITIONS } from "@/types/ai";
import { useLocationStore } from "@/stores/locationStore";
import { useCopilotContextState } from "./useCopilotContext";
import { AgentCard } from "./AgentCard";
import { AgentTeam } from "./AgentTeam";
import "./AgentStrip.css";

/**
 * The six AI agent cards, first in the workspace panel's "AI" section (🤖 on
 * the rail). A place's Overview points here with AgentCallout.tsx.
 *
 * This is the only place they render. Two earlier arrangements are gone and
 * the comment here described both of them: a full grid in an Intelligence
 * panel "AI Agents" tab (removed - see IntelligencePanel.tsx), and a strip
 * below the map (removed because it sat under the page fold, where in
 * practice nobody found it - see AgentStrip.css). A comment pointing at
 * features that no longer exist is worse than no comment: the Help & Guide
 * was still telling people to "scroll below the map" to find these.
 */
export function AgentStrip() {
  const location = useLocationStore((s) => s.selectedLocation);
  // The cards still wait for the panels' own loads before offering Run, so
  // an answer appears beside the numbers it explains, not before them.
  const { pending } = useCopilotContextState();

  return (
    <div className="agent-strip">
      {/* Several agents on one request comes first: it is the way to ask a
          real question; the cards below each explain one angle on their own. */}
      <AgentTeam />
      <div className="agent-strip__head">
        <strong>AI agents</strong>
        <span className="agent-strip__hint">
          {location
            ? `${AGENT_DEFINITIONS.length} agents, each explaining this place from one angle. Tap Run on any of them.`
            : `${AGENT_DEFINITIONS.length} agents are ready. Search a place or tap the map first, then tap Run.`}
        </span>
      </div>
      <div className="agent-strip__row">
        {AGENT_DEFINITIONS.map((def) => (
          <div className="agent-strip__item" key={def.kind}>
            <AgentCard definition={def} pending={pending} />
          </div>
        ))}
      </div>
    </div>
  );
}
