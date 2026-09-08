import { fetchWithTimeout } from "./cache.js";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AiResult = { ok: true; content: string; model: string } | { ok: false; error: string };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Thin abstraction over the AI provider so swapping providers later is a
 * config change, not a rewrite (see .env.example — AI_MODEL_* all point
 * here). OpenRouter's free tier by default. Never throws: a missing key or
 * a provider failure comes back as {ok:false, error}, the same
 * graceful-degradation discipline as every other external-data handler in
 * this project (geocode/gis/weather/route all follow this shape).
 */
export async function getAiCompletion(
  messages: AiMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number } = {}
): Promise<AiResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = opts.model || process.env.OPENROUTER_MODEL || "openrouter/free";

  if (!apiKey) {
    return { ok: false, error: "AI features aren't configured yet — an OPENROUTER_API_KEY is needed on the server." };
  }

  try {
    const response = await fetchWithTimeout(
      OPENROUTER_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
          "X-Title": "maNOWj GeoIntel",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: opts.maxTokens ?? 700,
          temperature: opts.temperature ?? 0.3,
        }),
      },
      // Free-tier/rate-limited OpenRouter models can genuinely take this
      // long. Must stay comfortably under the frontend's AI_REQUEST_TIMEOUT_MS
      // (src/services/ai.ts, 35s) — this was 20s == the client's old 20s
      // timeout exactly, so the client aborted before this could ever win.
      25_000
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[ai] provider error", response.status, text.slice(0, 300));
      // A flat "temporarily unavailable" for every non-2xx status hid the
      // difference between "this will pass in a minute" and "this will
      // never work until you fix something" — a free-tier key hitting
      // OpenRouter's daily/rate limit (429) or an invalid/expired key (401)
      // looks identical to a real outage otherwise, so every agent run
      // reports the same vague error no matter the actual cause.
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: "The AI provider rejected the configured API key (unauthorized). Check OPENROUTER_API_KEY." };
      }
      if (response.status === 429) {
        return { ok: false, error: "The AI provider's rate limit or free-tier quota was hit. Try again later, or use a different model/key." };
      }
      return { ok: false, error: `The AI provider is temporarily unavailable (HTTP ${response.status}).` };
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, error: "The AI provider returned an empty response." };
    }
    return { ok: true, content, model };
  } catch (error) {
    console.error("[ai] request failed", error);
    return { ok: false, error: "The AI provider is temporarily unavailable." };
  }
}
