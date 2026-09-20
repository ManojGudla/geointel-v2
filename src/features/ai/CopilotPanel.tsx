import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAiStore } from "@/stores/aiStore";
import { useLocationStore } from "@/stores/locationStore";
import { askCopilot } from "@/services/ai";
import { ApiUnavailableError } from "@/services/apiClient";
import { useCopilotContext } from "./useCopilotContext";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { panelRiseFromBottom } from "@/lib/motionVariants";
import { formatAiText } from "@/lib/formatAiText";
import { aiAttribution } from "@/lib/formatAiMeta";
import { contextSummary, copilotSuggestions } from "./copilotSuggestions";
import { useGisUiStore } from "@/stores/gisUiStore";
import { useMapStore } from "@/stores/mapStore";
import { useAnalysisStore } from "@/stores/analysisStore";
import type { GISLayerId } from "@/types/gis";
import "./CopilotPanel.css";

export function CopilotPanel() {
  const isOpen = useAiStore((s) => s.isCopilotOpen);
  const close = useAiStore((s) => s.closeCopilot);
  const messages = useAiStore((s) => s.messages);
  const isAsking = useAiStore((s) => s.isAsking);
  const radiusMeters = useLocationStore((s) => s.radiusMeters);
  const layerVisibility = useGisUiStore((s) => s.visibility);
  const is3D = useMapStore((s) => s.is3D);
  const analysisResult = useAnalysisStore((s) => s.result);
  const addMessage = useAiStore((s) => s.addMessage);
  const setAsking = useAiStore((s) => s.setAsking);
  const clearConversation = useAiStore((s) => s.clearConversation);
  const location = useLocationStore((s) => s.selectedLocation);
  const context = useCopilotContext();
  const [draft, setDraft] = useState("");
  const motionEnabled = useMotionPreference();

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isAsking) return;

    addMessage({ role: "user", content: trimmed });
    setDraft("");
    setAsking(true);

    try {
      const { answer, sources, model, generatedAt } = await askCopilot(trimmed, context);
      addMessage({ role: "assistant", content: answer, sources, model, generatedAt });
    } catch (error) {
      const message =
        error instanceof ApiUnavailableError
          ? error.message
          : "Ask maNOWj ran into an unexpected problem. Please try again.";
      addMessage({ role: "assistant", content: message, isError: true });
    } finally {
      setAsking(false);
    }
  };

  const copilotContext = {
    placeName: location?.name ?? null,
    radiusMeters,
    activeLayers: (Object.entries(layerVisibility) as Array<[GISLayerId, boolean]>).filter(([, on]) => on).map(([id]) => id),
    hasAnalysis: !!analysisResult,
    analysisTitle: analysisResult?.title ?? null,
    is3D,
  };
  const suggestions = copilotSuggestions(copilotContext);

  const content = (
    <>
      <div className="copilot-panel__head">
        <h2>✨ Ask maNOWj</h2>
        <button type="button" onClick={close} aria-label="Close Ask maNOWj">
          ✕
        </button>
      </div>

      {/* States what it is looking at, always. An assistant whose
          context is invisible is one the user has to guess at - and guessing
          wrong is how you get an answer about the wrong place. */}
      <p className="copilot-panel__context">{contextSummary(copilotContext)}</p>

      <div className="copilot-panel__thread" aria-live="polite">
        {messages.length === 0 && (
          <div className="copilot-panel__intro">
            <p>Ask anything about {location ? location.name : "GeoIntel"}.</p>
            <div className="copilot-panel__suggestions">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => ask(suggestion)} disabled={isAsking}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`copilot-panel__message copilot-panel__message--${m.role}${m.isError ? " copilot-panel__message--error" : ""}`}>
            <p>{m.role === "assistant" && !m.isError ? formatAiText(m.content) : m.content}</p>
            {m.sources && m.sources.length > 0 && <span className="copilot-panel__sources">Sources: {m.sources.join(", ")}</span>}
            {/* Attribution on the answer, not on the question and not on an
                error this app wrote itself. */}
            {m.role === "assistant" && !m.isError && m.model && (
              <span className="copilot-panel__attribution">{aiAttribution(m.model, m.generatedAt)}</span>
            )}
          </div>
        ))}
        {isAsking && (
          <div className="copilot-panel__message copilot-panel__message--assistant copilot-panel__message--pending">
            <span className="async-panel__spinner" aria-hidden="true" /> Thinking…
          </div>
        )}
      </div>

      <form
        className="copilot-panel__form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={location ? `Ask about ${location.name}…` : "Ask a question…"}
          maxLength={500}
          aria-label="Ask maNOWj a question"
        />
        <button type="submit" disabled={isAsking || !draft.trim()}>
          Ask
        </button>
      </form>

      {/* Only shown once a conversation is under way - before that the same
          suggestions already appear in the empty thread above, and two
          identical lists on one small panel is clutter. */}
      {messages.length > 0 && (
        <div className="copilot-panel__suggested">
          <span>Suggested questions</span>
          <ul>
            {suggestions.map((q) => (
              <li key={q}>
                <button type="button" onClick={() => ask(q)} disabled={isAsking}>
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {messages.length > 0 && (
        <button type="button" className="copilot-panel__clear" onClick={clearConversation}>
          Clear conversation
        </button>
      )}
    </>
  );

  if (!motionEnabled) {
    if (!isOpen) return null;
    return (
      <div className="copilot-panel" role="dialog" aria-label="Ask maNOWj">
        {content}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="copilot-panel" role="dialog" aria-label="Ask maNOWj" {...panelRiseFromBottom}>
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
