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
       * The model that ACTUALLY answered, as the provider reported it - not
       * the slug we asked for. Those are routinely different: the default
       * `openrouter/free` is a router, not a model, and OpenRouter picks a
       * free model at random from what is available at that moment. So two
       * runs of the same agent, a minute apart, can be answered by two
       * different models of very different quality, and reporting the
       * requested slug would have told the reader "openrouter/free" both
       * times - a label that names no model at all.
       */
      model: string;
      /** What we asked for. Kept apart from `model` so the two can differ. */
      requestedModel: string;
    }
  | { ok: false; error: string };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Not a model - a router that picks a free model at random per request.
 * That randomness is why a retry against it is worth making: a bad roll
 * (a reasoning model that spends its whole budget thinking and returns
 * nothing) is not repeated, it is re-rolled.
 */
const FREE_ROUTER = "openrouter/free";

/**
 * The free models to ask, in order, before falling back to the random router.
 *
 * Reported (November 2026): Ask maNOWj "sometimes gives random answers".
 * It did, structurally: `openrouter/free` hands every question to a
 * different free model chosen at random, so the same question got a sharp
 * answer from one model and a rambling or wrong one from the next. Pinning a
 * strong instruction-following model makes answers consistent; the router
 * stays as the last resort so a model being withdrawn never means no answer.
 *
 * Chosen from OpenRouter's live free list on 2026-11-06:
 *  - Gemma 4 31B: strong at following instructions, and at Telugu, Hindi and
 *    mixed-language replies, which the system prompt asks for.
 *  - Gemma 4 26B-A4B: the backup. A mixture-of-experts model that only runs
 *    about 4B parameters per word, so it answers in a few seconds. (Nemotron
 *    3 Ultra was the backup first; on 2026-11-06 it took 36 seconds for one
 *    short answer, right at the chat's 35-second limit.)
 * A model slug that disappears answers 404, which the loop below treats as
 * "try the next one". OPENROUTER_MODEL, when set to a real model, goes first.
 */
const PREFERRED_FREE_MODELS = ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"];

/**
 * Some models leak their private reasoning into the answer as <think>…</think>.
 * The person asked a question, not for a transcript of the model's thoughts.
 */
export function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

/**
 * Thin abstraction over the AI provider so swapping providers later is a
 * config change, not a rewrite (see .env.example - AI_MODEL_* all point
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
  // A configured OPENROUTER_MODEL of "openrouter/free" (the old default in
  // .env.example) means "no preference", not "random every time".
  const configured = opts.model || process.env.OPENROUTER_MODEL;
  const requestedModel = configured && configured !== FREE_ROUTER ? configured : PREFERRED_FREE_MODELS[0]!;

  if (!apiKey) {
    return { ok: false, error: "AI features aren't configured yet. An OPENROUTER_API_KEY is needed on the server." };
  }

  /*
    NOTHING OPTIONAL GOES IN THIS BODY.

    A `reasoning: { exclude: true }` was added here once and had to come
    straight back out. OpenRouter does not ignore a parameter no endpoint
    supports and it does not answer 400 - it answers *404, "No endpoints
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
    provider returned an empty response", while the Navigation agent - same
    location, same moment - returned a genuinely good paragraph written by
    poolside/laguna-xs-2.1. Nothing was down. The free router had handed
    those two requests to a reasoning model, which spent its whole token
    budget thinking and returned an empty `content`.

    The router picks a model at RANDOM per request, so the single most
    effective response to a bad roll is to roll again. That is what this
    loop is: one retry, with the free router, which lands on a different
    model. It covers the three failures that a different model genuinely
    fixes - empty content, a 404 for a model slug that no longer exists, and
    a 5xx from one provider - and deliberately does not cover the two it
    cannot: a rejected API key and a rate limit, where a second request only
    wastes quota or makes the limit worse.
  */
  // Pinned model(s) first, the random router last. Never more than three
  // attempts: they all have to fit inside the client's 35-second budget.
  const attempts = [...new Set([requestedModel, ...PREFERRED_FREE_MODELS, FREE_ROUTER])].slice(0, 3);
  /*
    The client aborts at 35s (AI_REQUEST_TIMEOUT_MS in src/services/ai.ts).
    Two attempts have to finish inside that, so each gets half the old 25s
    budget plus a little. A retry that arrives after the client has already
    given up is worse than no retry - it burns free-tier quota for nobody.
  */
  const perAttemptMs = 11_000;
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
          /*
            Two different things answer 429, and only one of them is final.

            The account's daily free allowance being used up applies to every
            model, so trying another only wastes time. But a single popular
            free model being "temporarily rate-limited upstream" is common and
            says nothing about the others - and this used to give up on the
            first one, so Ask maNOWj reported "quota hit" while the backup
            model was sitting idle. Seen live on 2026-11-06.
          */
          const accountLimit = /per[- ]day|daily|credits|quota/i.test(text);
          if (accountLimit || isLast) {
            return {
              ok: false,
              error: accountLimit
                ? "Ask maNOWj has used today's free AI allowance. It resets daily; please try again later."
                : "The free AI models are busy (rate limited) right now. Please try again in a minute.",
            };
          }
          lastError = "The free AI models are busy (rate limited) right now. Please try again in a minute.";
          continue;
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
          lastError = `No AI endpoint matched this request. Check the OPENROUTER_MODEL setting ("${requestedModel}"). This is a configuration problem, not an outage.`;
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
      const content = stripReasoning(data.choices?.[0]?.message?.content ?? "");

      if (!content) {
        console.warn("[ai] empty content from", model, "(rolling for a different model)");
        lastError =
          "Every model tried returned an empty answer. Free models are shared and this usually passes. Press Run again in a moment.";
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
