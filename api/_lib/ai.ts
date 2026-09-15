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
 * Not a model — a router that picks a free model at random per request.
 * That randomness is why a retry against it is worth making: a bad roll
 * (a reasoning model that spends its whole budget thinking and returns
 * nothing) is not repeated, it is re-rolled.
 */
const FREE_ROUTER = "openrouter/free";

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
  const requestedModel = opts.model || process.env.OPENROUTER_MODEL || FREE_ROUTER;

  if (!apiKey) {
    return { ok: false, error: "AI features aren't configured yet — an OPENROUTER_API_KEY is needed on the server." };
  }

  /*
    NOTHING OPTIONAL GOES IN THIS BODY.

    A `reasoning: { exclude: true }` was added here once and had to come
    straight back out. OpenRouter does not ignore a parameter no endpoint
    supports and it does not answer 400 — it answers *404, "No endpoints
    found that support the provided ... value"*. With the free router picking
    a different model per request, an optional flag became a coin-flip on
    whether any answer came back at all.

    So: model, messages, max_tokens, temperature. Every one is supported by
    every chat endpoint. Anything beyond them has to be worth losing every
    answer from a model that doesn't implement it.
  */
  const send = (model: string, timeoutMs: number) =>
    fetchWithTimeout(
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
      timeoutMs
    );

  /*
    Two attempts, and the second is the point.

    Reported live: Travel Intelligence and Make My Trip both showed "The AI
    provider returned an empty response", while the Navigation agent — same
    location, same moment — returned a genuinely good paragraph written by
    poolside/laguna-xs-2.1. Nothing was down. The free router had handed
    those two requests to a reasoning model, which spent its whole token
    budget thinking and returned an empty `content`.

    The router picks a model at RANDOM per request, so the single most
    effective response to a bad roll is to roll again. That is what this
    loop is: one retry, with the free router, which lands on a different
    model. It covers the three failures that a different model genuinely
    fixes — empty content, a 404 for a model slug that no longer exists, and
    a 5xx from one provider — and deliberately does not cover the two it
    cannot: a rejected API key and a rate limit, where a second request only
    wastes quota or makes the limit worse.
  */
  const attempts = [requestedModel, FREE_ROUTER];
  /*
    The client aborts at 35s (AI_REQUEST_TIMEOUT_MS in src/services/ai.ts).
    Two attempts have to finish inside that, so each gets half the old 25s
    budget plus a little. A retry that arrives after the client has already
    given up is worse than no retry — it burns free-tier quota for nobody.
  */
  const perAttemptMs = 15_000;
  let lastError = "The AI provider is temporarily unavailable.";

  for (let i = 0; i < attempts.length; i += 1) {
    const model = attempts[i]!;
    const isLast = i === attempts.length - 1;

    try {
      const response = await send(model, perAttemptMs);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.error("[ai] provider error", model, response.status, text.slice(0, 300));

        // A flat "temporarily unavailable" for every non-2xx status hid the
        // difference between "this will pass in a minute" and "this will
        // never work until you fix something".
        if (response.status === 401 || response.status === 403) {
          return { ok: false, error: "The AI provider rejected the configured API key (unauthorized). Check OPENROUTER_API_KEY." };
        }
        if (response.status === 429) {
          return { ok: false, error: "The AI provider's rate limit or free-tier quota was hit. Try again later, or use a different model/key." };
        }
        if (response.status === 404) {
          /*
            A model slug that no longer exists, or a request no endpoint can
            serve as asked. Neither is temporary and neither is fixed by
            waiting, so if this is the last word it points at the setting.

            It names `requestedModel`, not `model`: by the time this is the
            final error the loop may have fallen through to the free router,
            and naming that would send the reader to change a value they
            never set. The configured slug is the one they can act on.
          */
          lastError = `No AI endpoint matched this request — check the OPENROUTER_MODEL setting ("${requestedModel}"). This is a configuration problem, not an outage.`;
        } else {
          lastError = `The AI provider is temporarily unavailable (HTTP ${response.status}).`;
        }
        if (isLast) return { ok: false, error: lastError };
        continue;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        /*
          Parsed away and thrown out in an earlier version, which is why
          every answer used to be labelled with the slug we ASKED for.
          OpenRouter names the model that actually served the request here,
          and with a router slug this is the only place it appears.
        */
        model?: string;
      };
      const content = data.choices?.[0]?.message?.content?.trim();

      if (!content) {
        console.warn("[ai] empty content from", model, "— rolling for a different model");
        lastError =
          "Every model tried returned an empty answer. Free models are shared and this usually passes — press Run again in a moment.";
        if (isLast) return { ok: false, error: lastError };
        continue;
      }

      const served = typeof data.model === "string" && data.model.trim() ? data.model.trim() : model;
      return { ok: true, content, model: served, requestedModel };
    } catch (error) {
      console.error("[ai] request failed", model, error);
      lastError = "The AI provider is temporarily unavailable.";
      if (isLast) return { ok: false, error: lastError };
    }
  }

  return { ok: false, error: lastError };
}
