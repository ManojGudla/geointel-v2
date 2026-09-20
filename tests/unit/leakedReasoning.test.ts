import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { formatAiText, stripLeakedReasoning } from "../../src/lib/formatAiText";
import { getAiCompletion } from "../../api/_lib/ai";

/**
 * Captured from the live site, verbatim.
 *
 * The GIS agent on Banjara Hills, answered by
 * nvidia/nemotron-3-super-120b-a12b:free, opened by reciting the system
 * prompt back at the reader. The prompt forbids exactly this, in as many
 * words ("Never show your reasoning, planning, or thinking process") - a
 * reasoning model emitted it regardless, which is why the fix cannot be
 * another sentence of instruction.
 */
const LIVE_LEAK =
  "We need to output a short result card for a real person to read, focusing purely on GIS evidence counts and category scores, interpreting underlying numbers. " +
  "No markdown, no bold, no lists, no headers. 3-5 plain flowing sentences. Use only current location data. " +
  "Within 250 metres this is overwhelmingly built fabric rather than commerce: 156 buildings against a single shop and no offices at all. " +
  "The two residential buildings and two amenities are too few to characterise the area on their own, so the commercial and residential scores of 4 rest on thin evidence.";

describe("stripping a model's planning out of its answer", () => {
  it("removes the preamble seen on the live site and keeps the actual answer", () => {
    const cleaned = stripLeakedReasoning(LIVE_LEAK);
    expect(cleaned.startsWith("Within 250 metres")).toBe(true);
    expect(cleaned).toContain("156 buildings");
    expect(cleaned).not.toContain("No markdown");
    expect(cleaned).not.toContain("We need to output");
  });

  it("catches it by subject, not by opener phrase", () => {
    /*
      The old guard matched a fixed list of openers - "Let me analyze",
      "Here's my thinking process" - and "We need to" was simply not on it.
      Chasing openers one at a time is a losing game, so a sentence about
      markdown or sentence counts is treated as planning whatever it opens
      with: no real description of a neighbourhood mentions headers.
    */
    const odd =
      "Producing the card now. No bullet lists, no headers, three to five flowing sentences. " +
      "The area reads as dense residential fabric, with 156 buildings mapped inside the 250 metre ring and almost no retail.";
    expect(stripLeakedReasoning(odd).startsWith("The area reads")).toBe(true);
  });

  it("removes an explicit thinking block, closed or not", () => {
    const closed = "<think>The user wants a GIS read. I should cite the counts.</think> Retail is sparse here: one shop within 250 metres, against 156 mapped buildings.";
    expect(stripLeakedReasoning(closed).startsWith("Retail is sparse")).toBe(true);

    // An unclosed opener means everything after it is reasoning, and the
    // real answer is whatever came before.
    const unclosed = "Retail is sparse here: one shop within 250 metres, against 156 mapped buildings. <think>Should I mention the scores as well";
    expect(stripLeakedReasoning(unclosed)).not.toContain("Should I mention");
  });

  it("leaves a clean answer completely alone", () => {
    // The common case by far. A guard that quietly edits good answers is
    // worse than the leak it was written for.
    const clean =
      "Within 250 metres this is overwhelmingly built fabric rather than commerce: 156 buildings against a single shop and no offices. " +
      "The evidence is thin for anything beyond that, so treat the category scores as indicative only.";
    expect(stripLeakedReasoning(clean)).toBe(clean);
  });

  it("never trades a bad answer for an empty card", () => {
    /*
      If a response is nothing BUT planning, stripping it would leave a blank
      card - which reads as broken rather than as poor. Better to show the
      rambling and let the reader judge it; the model line underneath now
      tells them who wrote it.
    */
    const allPlanning = "We need to write the card. No markdown, no lists.";
    expect(stripLeakedReasoning(allPlanning)).toBe(allPlanning);
  });

  it("only ever strips from the front", () => {
    // A false positive must cost a leading sentence at most, never a
    // sentence in the middle of a real answer.
    const midSentence =
      "The area is dense residential fabric with 156 buildings inside 250 metres. " +
      "We need to be careful reading the commercial score, which rests on one shop.";
    expect(stripLeakedReasoning(midSentence)).toBe(midSentence);
  });

  it("still does the markdown cleanup it always did", () => {
    expect(formatAiText("**Dense** residential fabric here, with `156` buildings mapped inside the 250 metre ring and very little retail.")).toContain(
      "Dense residential fabric"
    );
    expect(formatAiText("## Heading\n- 7 petrol stations\n- 5 parks")).not.toContain("#");
  });
});

describe("what may be sent to the provider", () => {
  /**
   * This suite exists because of an outage I caused.
   *
   * A `reasoning: { exclude: true }` was added to the request body to stop
   * reasoning models reciting the prompt back at the reader. OpenRouter does
   * not ignore a parameter that no endpoint supports, and does not answer
   * 400 - it answers **404, "No endpoints found that support the provided
   * ... value"**. The guard written alongside it only retried on 400, so
   * with `openrouter/free` picking a different model per request, whether
   * any answer came back at all became a coin flip. Every agent broke.
   *
   * It was also aimed at the wrong thing: `exclude` governs the separate
   * `reasoning` field, while the leak actually observed was inside
   * `content`. The display-side strip above is what fixes it, and it needs
   * nothing from the provider.
   */
  const ORIGINAL_ENV = { ...process.env };
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, OPENROUTER_API_KEY: "test-key" };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  const okResponse = {
    ok: true,
    status: 200,
    json: async () => ({ model: "x/y:free", choices: [{ message: { content: "An answer long enough to survive." } }] }),
  };

  it("sends only parameters every chat endpoint supports", async () => {
    const spy = vi.fn(async () => okResponse);
    vi.stubGlobal("fetch", spy);
    await getAiCompletion([{ role: "user", content: "hi" }]);

    const [, init] = spy.mock.calls[0] as unknown as [string, { body: string }];
    const sent = JSON.parse(init.body);
    expect(Object.keys(sent).sort()).toEqual(["max_tokens", "messages", "model", "temperature"]);
    // Named so it cannot come back without this test being deliberately changed.
    expect(sent.reasoning).toBeUndefined();
  });

  it("makes exactly one request when the first answer is usable", async () => {
    /*
      The retry budget is for bad rolls, not for every call: two 15s attempts
      have to fit inside the client's 35s abort (src/services/ai.ts).
    */
    const spy = vi.fn(async () => okResponse);
    vi.stubGlobal("fetch", spy);
    await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("calls a 404 a configuration problem rather than an outage", async () => {
    // Waiting never fixes this one, so the message must not suggest it might.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, text: async () => "No endpoints found that support the provided parameters" }))
    );
    const result = await getAiCompletion([{ role: "user", content: "hi" }], { model: "some/model:free" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Names the CONFIGURED slug, not the free router it fell through to -
      // otherwise it sends the reader to change a value they never set.
      expect(result.error).toContain("some/model:free");
      expect(result.error).toMatch(/configuration/i);
      expect(result.error).not.toMatch(/temporarily/i);
    }
  });
});

describe("a bad roll from the free model router", () => {
  /**
   * Reported live, on one location at one moment: Travel Intelligence and
   * Make My Trip both showed "The AI provider returned an empty response",
   * while the Navigation agent returned a genuinely good paragraph written
   * by poolside/laguna-xs-2.1. Nothing was down. `openrouter/free` is a
   * router that picks a free model at RANDOM per request, and those two
   * requests drew a reasoning model that spent its whole token budget
   * thinking and returned empty content.
   *
   * Against random routing, the effective answer to a bad roll is to roll
   * again - not to report failure to someone who can only press the same
   * button themselves.
   */
  const ORIGINAL_ENV = { ...process.env };
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, OPENROUTER_API_KEY: "test-key" };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  const empty = { ok: true, status: 200, json: async () => ({ model: "some/reasoner:free", choices: [{ message: { content: "" } }] }) };
  const good = {
    ok: true,
    status: 200,
    json: async () => ({ model: "poolside/laguna-xs-2.1:free", choices: [{ message: { content: "Paayilis road is a residential area with 53 nearby buildings." } }] }),
  };

  it("re-rolls when a model returns nothing, and reports the one that answered", async () => {
    const spy = vi.fn().mockResolvedValueOnce(empty).mockResolvedValueOnce(good);
    vi.stubGlobal("fetch", spy);

    const result = await getAiCompletion([{ role: "user", content: "hi" }], { model: "some/reasoner:free" });

    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    // The retry goes to the router, which is what makes it a different model.
    const [, second] = spy.mock.calls[1] as unknown as [string, { body: string }];
    expect(JSON.parse(second.body).model).toBe("openrouter/free");
    if (result.ok) expect(result.model).toBe("poolside/laguna-xs-2.1:free");
  });

  it("gives up after one re-roll rather than hammering the free tier", async () => {
    const spy = vi.fn(async () => empty);
    vi.stubGlobal("fetch", spy);
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    // And says something the reader can act on.
    if (!result.ok) expect(result.error).toMatch(/Run again/i);
  });

  it("never re-rolls a rejected key or a rate limit", async () => {
    /*
      A second request cannot fix either, and for a rate limit it actively
      makes things worse by spending more of a quota that is already gone.
    */
    for (const status of [401, 403, 429]) {
      const spy = vi.fn(async () => ({ ok: false, status, text: async () => "no" }));
      vi.stubGlobal("fetch", spy);
      const result = await getAiCompletion([{ role: "user", content: "hi" }]);
      expect(result.ok, `status ${status}`).toBe(false);
      expect(spy, `status ${status}`).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    }
  });

  it("re-rolls a 5xx, which is one provider having a bad moment", async () => {
    const spy = vi.fn().mockResolvedValueOnce({ ok: false, status: 502, text: async () => "bad gateway" }).mockResolvedValueOnce(good);
    vi.stubGlobal("fetch", spy);
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("em dashes never reach the screen", () => {
  /**
   * The product does not use em dashes anywhere, and both AI system prompts
   * now say so. This is the enforcement behind that instruction: the same
   * free models that ignore "no markdown" and "never show your reasoning"
   * will ignore this one too, and `openrouter/free` draws a different model
   * every request, so it only has to be ignored once.
   */
  it("turns a clause-joining dash into a comma", () => {
    expect(formatAiText("The area is dense \u2014 156 buildings sit inside the 250 metre ring, with almost no retail.")).toBe(
      "The area is dense, 156 buildings sit inside the 250 metre ring, with almost no retail."
    );
  });

  it("turns an unspaced dash into a hyphen, since that is what was meant", () => {
    // A range or a compound, not a joined clause.
    expect(formatAiText("Expect 20\u201430 minutes on foot from the station to the office park entrance.")).toContain("20-30");
  });

  it("leaves no em dash behind under any spacing", () => {
    const messy = "One \u2014two\u2014 three \u2014 four, and a fifth clause to carry the sentence past the length floor.";
    expect(formatAiText(messy)).not.toContain("\u2014");
  });
});
