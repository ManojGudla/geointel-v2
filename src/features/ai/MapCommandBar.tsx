import { useState } from "react";
import { useLocationStore } from "@/stores/locationStore";
import { useMapStore } from "@/stores/mapStore";
import { useAnalysisStore } from "@/stores/analysisStore";
import { apiPost } from "@/services/apiClient";
import { type AnalysisRequest } from "@/features/analysis/runAnalysis";
import { useRunAnalysis } from "@/features/analysis/useRunAnalysis";
import { categoryLabel } from "@/features/analysis/categories";
import { layerLabels, layersForRequest } from "@/features/analysis/layerSync";
import { SUITABILITY_PRESETS } from "@/features/analysis/suitability";
import { AnalysisResultView } from "@/features/analysis/AnalysisResultView";
import { describeCommand, parseMapCommand, type MapCommand } from "./mapCommands";
import { describeSettingCommand, parseSettingCommand, type SettingCommand } from "./settingCommands";
import { useWeatherEffectStore } from "@/features/weather/effects/weatherEffectStore";
import { formatDistance } from "@/features/measure/measureMath";
import type { NearbyCategory } from "@/types/intel";
import "./MapCommandBar.css";

const EXAMPLES = ["hospitals within 5 km", "nearest petrol station", "is this a good place for a school", "what is within 800 m"];

/** A real stage of work, not a decorative progress animation. */
interface Step {
  label: string;
  state: "pending" | "active" | "done";
}

function presetLabel(id: string): string {
  return SUITABILITY_PRESETS.find((p) => p.id === id)?.label ?? id;
}

function toRequest(command: MapCommand, origin: { lat: number; lon: number }): AnalysisRequest {
  switch (command.operation) {
    case "within":
      return { operation: "within", origin, category: command.category, radiusMeters: command.radiusMeters };
    case "nearest":
      return { operation: "nearest", origin, category: command.category, radiusMeters: 10_000 };
    case "buffer":
      return { operation: "buffer", origin, radiusMeters: command.radiusMeters };
    case "suitability":
      return { operation: "suitability", origin, presetId: command.presetId, radiusMeters: command.radiusMeters };
  }
}

/**
 * Find things on the map by describing them in plain language, and watch the
 * answer get drawn.
 *
 * The distinction that matters: the language model chooses WHICH spatial
 * operation to run and with what parameters. It never produces the answer.
 * Every count, distance and score below comes from running that operation
 * against real OpenStreetMap data — so the model being wrong shows up as
 * "it searched for the wrong thing", visibly, rather than as a confident
 * fabricated number that nobody can check.
 *
 * Most questions never reach the model: the local parser (mapCommands.ts)
 * handles the common shapes instantly and for free, which also means this
 * keeps working after the free AI tier's daily quota is spent.
 *
 * The step list below is not a loading animation. Each line marks a real
 * transition — understood, radius set, layers switched on, data queried —
 * and the "layers switched on" step names the layers, because an analysis
 * that silently changes the map is only marginally better than one that
 * doesn't change it at all.
 */
export function MapCommandBar() {
  const location = useLocationStore((s) => s.selectedLocation);
  const setWeatherEffects = useWeatherEffectStore((s) => s.setEnabled);
  const setIs3D = useMapStore((s) => s.set3D);
  const setBasemap = useMapStore((s) => s.setBasemap);

  /**
   * Applies a settings command to the real stores. This is the half that
   * makes the Copilot honest: it changes the map state and only then reports
   * what it did, rather than acknowledging a request it never carried out.
   */
  const applySettingCommand = (command: SettingCommand) => {
    switch (command.setting) {
      case "weather-effects":
        setWeatherEffects(command.value);
        return;
      case "3d":
        setIs3D(command.value);
        return;
      case "basemap":
        setBasemap(command.value);
        return;
    }
  };
  const radiusMeters = useLocationStore((s) => s.radiusMeters);
  const { setError } = useAnalysisStore();
  const run = useRunAnalysis();

  const [question, setQuestion] = useState("");
  const [understood, setUnderstood] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usedModel, setUsedModel] = useState(false);

  const advance = (index: number, labels: string[]) =>
    setSteps(labels.map((label, i) => ({ label, state: i < index ? "done" : i === index ? "active" : "pending" })));

  const ask = async (text: string) => {
    if (!text.trim()) return;

    // Settings commands are handled FIRST, and they don't need a selected
    // location — "turn off weather effects" is about the map, not a place.
    // Each one applies the real store action before anything is said back, so
    // the reply can never claim a change that didn't happen.
    const setting = parseSettingCommand(text);
    if (setting) {
      applySettingCommand(setting);
      setProblem(null);
      setSteps([]);
      setUnderstood(describeSettingCommand(setting));
      return;
    }

    if (!location) return;

    setBusy(true);
    setProblem(null);
    setUnderstood(null);
    setUsedModel(false);

    const origin = { lat: location.lat, lon: location.lon };
    let labels = ["Understanding your question", "Setting the search area", "Switching on the layers needed", "Querying mapped features", "Preparing the result"];
    advance(0, labels);

    try {
      let command = parseMapCommand(text);

      if (!command) {
        // Local parser couldn't read it — spend one model call on working
        // out the operation.
        setUsedModel(true);
        const { intent } = await apiPost<{
          intent: { operation: string; category: string | null; presetId: string | null; radiusMeters: number | null };
        }>("/api/ai-intent", { question: text });

        const radius = intent.radiusMeters ?? radiusMeters;
        command =
          intent.operation === "suitability"
            ? { operation: "suitability", presetId: intent.presetId!, radiusMeters: radius }
            : intent.operation === "nearest"
              ? { operation: "nearest", category: intent.category as NearbyCategory }
              : intent.operation === "buffer"
                ? { operation: "buffer", radiusMeters: radius }
                : { operation: "within", category: intent.category as NearbyCategory, radiusMeters: radius };
      }

      // Echoed BEFORE the results, so a misreading is obvious at a glance
      // instead of being buried under a plausible-looking answer.
      setUnderstood(describeCommand(command, categoryLabel, presetLabel));

      const request = toRequest(command, origin);
      const layers = layerLabels(layersForRequest(request));

      // Now that the request is known, the middle steps can say what they
      // actually did rather than describing themselves in the abstract.
      labels = [
        "Understanding your question",
        request.operation === "nearest" ? "Searching outward from this point" : `Setting the search area to ${formatDistance(request.radiusMeters)}`,
        layers.length ? `Showing ${layers.join(", ")}` : "No extra layers needed",
        "Querying mapped features",
        "Preparing the result",
      ];
      advance(3, labels);

      await run(request);
      advance(labels.length, labels);
    } catch (e) {
      const message = e instanceof Error ? e.message : "That question couldn't be answered.";
      setProblem(message);
      setError(message);
      setSteps([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="map-command">
      <p className="map-command__lead">
        Ask in plain language. The answer is drawn on the map and computed from real mapped data — the AI only decides which
        analysis to run.
      </p>

      <form
        className="map-command__form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. hospitals within 5 km"
          aria-label="Find things on the map"
          disabled={!location}
        />
        <button type="submit" disabled={!location || busy || !question.trim()}>
          {busy ? "Working…" : "Ask"}
        </button>
      </form>

      {!location && (
        <p className="map-command__note">
          Select a location first — every question is answered about the area around it.
        </p>
      )}

      <div className="map-command__examples">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            disabled={!location || busy}
            onClick={() => {
              setQuestion(example);
              void ask(example);
            }}
          >
            {example}
          </button>
        ))}
      </div>

      {understood && (
        <p className="map-command__understood">
          {understood}
          {/* Worth surfacing: it tells the user when a question cost one of
              the day's limited AI calls and when it was free. */}
          <span>{usedModel ? "interpreted by AI" : "understood directly, no AI call used"}</span>
        </p>
      )}

      {steps.length > 0 && (
        <ol className="map-command__steps" aria-live="polite">
          {steps.map((step) => (
            <li key={step.label} className={`map-command__step map-command__step--${step.state}`}>
              <span className="map-command__step-mark" aria-hidden="true">
                {step.state === "done" ? "✓" : step.state === "active" ? "•" : "·"}
              </span>
              {step.label}
            </li>
          ))}
        </ol>
      )}

      {problem && <p className="map-command__problem">{problem}</p>}

      {/* The answer appears right here, under the question. Sending the user
          to another panel to read it would also unmount the line above that
          says what the question was understood to mean — which is the part
          that makes a misreading obvious. */}
      {understood && !problem && <AnalysisResultView />}
    </div>
  );
}
