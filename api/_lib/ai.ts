import { fetchWithTimeout } from "./cache.js";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AiResult =
  | {
      ok: true;
      content: string;
      /**
       * The model that ACTUALLY answered, as the provider reported it — not
       * the slug we asked for. Those are routinely different: the default
       * `openrouter/free` is a router, not a model, and OpenRouter picks a
       * free model at random from what is available at that moment. So two
       * runs of the same agent, a minute apart, can be answered by two
       * different models of very different quality, and reporting the
       * requested slug would have told the reader "openrouter/free" both
       * times — a label that names no model at all.
       */
      model: string;
      /** What we asked for. Kept apart from `model` so the two can differ. */
      requestedModel: string;
    }
  | { ok: false; error: string };

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
  const requestedModel = opts.model || process.env.OPENROUTER_MODEL || "openrouter/free";

  if (!apiKey) {
    return { ok: false, error: "AI features aren't configured yet — an OPENROUTER_API_KEY is needed on the server." };
  }

  /*
    NOTHING OPTIONAL GOES IN THIS BODY.

    A `reasoning: { exclude: true }` was added here to stop reasoning models
    reciting the system prompt back at the reader, and it took the whole AI
    layer down. OpenRouter does not ignore a parameter no endpoint supports
    and it does not answer 400 — it answers *404, "No endpoints found that
    support the provided ... value"*, and the guard written for this only
    retried on 400. With `openrouter/free` routing to a different model each
    request, that turned an optional flag into a coin-flip on whether any
    answer came back at all.

    It was not even aimed at the right thing. `exclude` governs the separate
    `reasoning` field; the leak actually observed was inside `content`, which
    that parameter does not touch. The fix that works is on the display side
    — stripLeakedReasoning() in src/lib/formatAiText.ts — and it needs no
    cooperation from the provider.

    So: model, messages, max_tokens, temperature. Every one of those is
    supported by every chat endpoint. Anything beyond them has to be worth
    losing every answer from a model that doesn't implement it.
  */
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
          model: requestedModel,
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
      /*
        The status that took this whole layer down once, so it now names
        itself instead of hiding inside "temporarily unavailable". OpenRouter
        answers 404 for "no endpoint can serve this request as asked" — a
        model slug that no longer exists, or a request parameter no provider
        for that model supports. Neither is temporary and neither is fixed by
        waiting, so the message has to point at the configuration.
      */
      if (response.status === 404) {
        return {
          ok: false,
          error: `No AI endpoint matched this request — check the OPENROUTER_MODEL setting ("${requestedModel}"). This is a configuration problem, not an outage.`,
        };
      }
      return { ok: false, error: `The AI provider is temporarily unavailable (HTTP ${response.status}).` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      /*
        This field was being parsed away and thrown out, which is the whole
        bug. OpenRouter names the model that served the request here; when
        the request asked for a router slug rather than a model, this is the
        ONLY place the real answer appears.
      */
      model?: string;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, error: "The AI provider returned an empty response." };
    }
    // Fall back to the requested slug only if the provider didn't say — an
    // unknown model is better reported as the thing we asked for than as
    // nothing at all, but it must never overwrite what the provider reports.
    const served = typeof data.model === "string" && data.model.trim() ? data.model.trim() : requestedModel;
    return { ok: true, content, model: served, requestedModel };
  } catch (error) {
    console.error("[ai] request failed", error);
    return { ok: false, error: "The AI provider is temporarily unavailable." };
  }
}
