import { track } from "@/services/analytics";
import { apiPost } from "@/services/apiClient";
import { createRequestGate } from "@/services/aiRequestQueue";
import type { AgentAnchor, AgentKind, AgentResult, EvidenceItem, TeamResult, TripPlan, TripStop } from "@/types/ai";

// AI completions (OpenRouter, often on free-tier/rate-limited models) run
// meaningfully slower than the other data endpoints and take the apiClient
// default (20s) right up to its own server-side OpenRouter timeout - the
// exact bug the user hit ("agents also not working"): the client gave up
// at almost the same moment the server might have succeeded. 35s here vs.
// the server's 25s (api/_lib/ai.ts) leaves real margin for network/parse
// overhead on top of the provider's own response time.
/**
 * How long the browser waits for an AI answer. The agents and the Copilot
 * fetch their evidence on the server before the model writes, so this is a
 * few seconds more than the model's own 30 s; the server budgets 37 s.
 */
const AGENT_REQUEST_TIMEOUT_MS = 40_000;

// Every AI call in the app shares one provider key, so they share one rate
// limit - see aiRequestQueue.ts for the reported bug this fixes (clicking
// the six agent cards in a row 429'd two of them). Two at a time keeps the
// strip feeling responsive while staying well clear of a free-tier burst
// limit; the gap stops even those two from leaving at the same instant.
const aiGate = createRequestGate({ maxConcurrent: 2, minGapMs: 600 });

/** An earlier turn, as the server accepts it. */
export interface CopilotTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Counts an AI request the person was waiting for. A cancelled request (they
 * closed the panel or asked something else) is neither a success nor a
 * failure, so it is not counted. The question text never leaves in an event.
 */
async function measured<T>(surface: string, run: () => Promise<T>, modelOf?: (value: T) => string | undefined): Promise<T> {
  const started = Date.now();
  try {
    const value = await run();
    track("ai_question_asked", { surface, durationMs: Date.now() - started, model: modelOf?.(value) });
    return value;
  } catch (error) {
    if ((error as { name?: string } | null)?.name !== "AbortError") {
      track("ai_question_failed", { surface, durationMs: Date.now() - started, reason: error instanceof Error && /timed out/.test(error.message) ? "timeout" : error instanceof Error ? error.name : "unknown" });
    }
    throw error;
  }
}

export interface CopilotAnswer {
  answer: string;
  sources: string[];
  model: string;
  generatedAt?: string;
  evidence?: EvidenceItem[];
  removedSentences?: number;
  /** Set when the AI could not write and only the checked facts came back. */
  aiUnavailable?: string;
}

/**
 * Asks the Copilot. Like the agents, it sends only where to look (nothing,
 * with no place selected); the server fetches the facts a question needs.
 */
export async function askCopilot(question: string, anchor: AgentAnchor | null, signal?: AbortSignal, history: CopilotTurn[] = []): Promise<CopilotAnswer> {
  // priority: a person is watching this one send box, so it goes ahead of
  // any agent cards already queued up behind it.
  return measured(
    "copilot",
    () =>
      aiGate.run(
        () =>
          apiPost<CopilotAnswer>(
            "/api/ai/copilot",
            // The last six turns; the server trims and caps them again.
            { question, anchor: anchor ?? undefined, history: history.slice(-6) },
            signal,
            // The server may fetch evidence first, as the agents do.
            AGENT_REQUEST_TIMEOUT_MS
          ),
        { priority: true }
      ),
    (value) => value.model
  );
}

/**
 * Runs one agent on a place. Only the anchor (where to look) is sent; the
 * server fetches and checks every fact itself.
 */
export async function runAgent(kind: AgentKind, anchor: AgentAnchor, signal?: AbortSignal, onStart?: () => void): Promise<AgentResult> {
  return measured(`agent:${kind}`, () =>
    aiGate.run(
      async () => {
        const { result } = await apiPost<{ result: AgentResult }>("/api/ai/agent", { kind, anchor }, signal, AGENT_REQUEST_TIMEOUT_MS);
        return result;
      },
      { onStart }
    )
  );
}

/**
 * Several agents on one request ("evaluate this place for a family home and
 * route to the nearest hospital"). One server request: it plans, fetches
 * every source once, makes one model call and checks every number.
 */
export async function askAgentTeam(request: string, anchor: AgentAnchor, signal?: AbortSignal): Promise<TeamResult> {
  return measured(
    "agent:team",
    () =>
      aiGate.run(
        async () => {
          const { result } = await apiPost<{ result: TeamResult }>("/api/ai/ask", { request, anchor }, signal, AGENT_REQUEST_TIMEOUT_MS);
          return result;
        },
        { priority: true }
      ),
    (value) => value.model
  );
}

export interface TripOptions {
  interests: string[];
  days: number;
  stopsPerDay: number;
  mode: "car" | "walk" | "bike";
  /** The visitor's own ordered stops, after editing. */
  stops?: TripStop[];
}

/** A Make My Trip plan: real mapped places, real routing, no model call. */
export async function buildTripPlan(anchor: AgentAnchor, options: TripOptions, signal?: AbortSignal): Promise<TripPlan> {
  const { plan } = await apiPost<{ plan: TripPlan }>("/api/ai/trip", { anchor, ...options }, signal, AGENT_REQUEST_TIMEOUT_MS);
  return plan;
}
