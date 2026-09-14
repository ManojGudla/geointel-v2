import { apiPost } from "@/services/apiClient";
import { createRequestGate } from "@/services/aiRequestQueue";
import type { AgentKind, AgentResult, CopilotContext } from "@/types/ai";

// AI completions (OpenRouter, often on free-tier/rate-limited models) run
// meaningfully slower than the other data endpoints and take the apiClient
// default (20s) right up to its own server-side OpenRouter timeout — the
// exact bug the user hit ("agents also not working"): the client gave up
// at almost the same moment the server might have succeeded. 35s here vs.
// the server's 25s (api/_lib/ai.ts) leaves real margin for network/parse
// overhead on top of the provider's own response time.
const AI_REQUEST_TIMEOUT_MS = 35_000;

// Every AI call in the app shares one provider key, so they share one rate
// limit — see aiRequestQueue.ts for the reported bug this fixes (clicking
// the six agent cards in a row 429'd two of them). Two at a time keeps the
// strip feeling responsive while staying well clear of a free-tier burst
// limit; the gap stops even those two from leaving at the same instant.
const aiGate = createRequestGate({ maxConcurrent: 2, minGapMs: 600 });

export async function askCopilot(
  question: string,
  context: CopilotContext,
  signal?: AbortSignal
): Promise<{ answer: string; sources: string[]; model: string; generatedAt?: string }> {
  // priority: a person is watching this one send box, so it goes ahead of
  // any agent cards already queued up behind it.
  return aiGate.run(
    () =>
      apiPost<{ answer: string; sources: string[]; model: string; generatedAt?: string }>(
        "/api/ai/copilot",
        { question, context },
        signal,
        AI_REQUEST_TIMEOUT_MS
      ),
    { priority: true }
  );
}

export async function runAgent(kind: AgentKind, context: CopilotContext, signal?: AbortSignal, onStart?: () => void): Promise<AgentResult> {
  return aiGate.run(
    async () => {
      const { result } = await apiPost<{ result: AgentResult }>("/api/ai/agent", { kind, context }, signal, AI_REQUEST_TIMEOUT_MS);
      return result;
    },
    { onStart }
  );
}
