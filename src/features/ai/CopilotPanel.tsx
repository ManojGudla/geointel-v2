import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAiStore } from "@/stores/aiStore";
import { useLocationStore } from "@/stores/locationStore";
import { askCopilot } from "@/services/ai";
import { useCopilotContext } from "./useCopilotContext";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { panelRiseFromBottom } from "@/lib/motionVariants";
import { formatAiText } from "@/lib/formatAiText";
import { ChatAnswer } from "./ChatAnswer";
import { contextSummary, copilotSuggestions } from "./copilotSuggestions";
import { useGisUiStore } from "@/stores/gisUiStore";
import { useMapStore } from "@/stores/mapStore";
import { useAnalysisStore } from "@/stores/analysisStore";
import type { GISLayerId } from "@/types/gis";
import "./CopilotPanel.css";
import { describeAiFailure } from "./aiErrors";

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
  /** Which place the conversation so far was about. */
  const historyPlace = useRef<string | null>(null);
  // Set when an answer arrives in this session, so only that answer types out.
  const justAnswered = useRef(false);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isAsking) return;

    // Offline, say so without sending a request that cannot arrive, and keep
    // what they typed.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      addMessage({ role: "assistant", content: describeAiFailure(null, false), isError: true });
      return;
    }

    /*
      Earlier turns go with the question so a follow-up ("and schools?") is
      understood, but only while the same place is selected. After moving to
      another place, the old turns describe somewhere else, and sending them
      would invite the model to answer with the previous place's numbers.
      Failed attempts are left out; they carry no information.
    */
    const placeKey = location ? `${location.lat},${location.lon}` : "none";
    const history =
      historyPlace.current === placeKey
        ? messages.filter((m) => !m.isError).map((m) => ({ role: m.role, content: m.content }))
        : [];
    historyPlace.current = placeKey;

    addMessage({ role: "user", content: trimmed });
    setDraft("");
    setAsking(true);

    try {
      const { answer, sources, model, generatedAt } = await askCopilot(trimmed, context, undefined, history);
      justAnswered.current = true;
      addMessage({ role: "assistant", content: answer, sources, model, generatedAt });
    } catch (error) {
      addMessage({ role: "assistant", content: describeAiFailure(error), isError: true });
      // Put the question back, so trying again is one press rather than
      // retyping it.
      setDraft((current) => current || trimmed);
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
        <div className="copilot-panel__headactions">
          {messages.length > 0 && (
            <button type="button" className="copilot-panel__clear" onClick={clearConversation}>
              Clear
            </button>
          )}
          <button type="button" onClick={close} aria-label="Close Ask maNOWj">
            ✕
          </button>
        </div>
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
        {messages.map((m, i) =>
          m.role === "assistant" && !m.isError ? (
            // Only the newest answer types itself out; earlier ones (and the
            // whole thread when the panel reopens) appear complete.
            <ChatAnswer key={i} text={formatAiText(m.content)} sources={m.sources} animate={i === messages.length - 1 && !!justAnswered.current} />
          ) : (
            <div key={i} className={`copilot-panel__message copilot-panel__message--${m.role}${m.isError ? " copilot-panel__message--error" : ""}`}>
              <p>{m.content}</p>
            </div>
          )
        )}
        {isAsking && (
          <div className="chat-answer chat-answer--pending" aria-label="Thinking">
            <span className="chat-answer__mark" aria-hidden="true">
              ✨
            </span>
            <span className="chat-answer__dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>

      {/* Once a conversation is under way the suggestions shrink to one
          scrollable row above the box. As a full list they used to fill most
          of the panel and squeeze the answers into a few lines. */}
      {messages.length > 0 && (
        <div className="copilot-panel__chips" role="group" aria-label="Suggested questions">
          {suggestions.map((q) => (
            <button key={q} type="button" onClick={() => ask(q)} disabled={isAsking}>
              {q}
            </button>
          ))}
        </div>
      )}

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

    </>
  );

  if (!motionEnabled) {
    if (!isOpen) return null;
    return (
      <div className={`copilot-panel${messages.length > 0 ? " copilot-panel--chatting" : ""}`} role="dialog" aria-label="Ask maNOWj">
        {content}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className={`copilot-panel${messages.length > 0 ? " copilot-panel--chatting" : ""}`} role="dialog" aria-label="Ask maNOWj" {...panelRiseFromBottom}>
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
