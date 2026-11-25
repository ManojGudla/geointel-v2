# AI reliability report

25 November 2026. From reading `api/_routes/ai/agent.ts`, `copilot.ts`,
`api/_routes/ai-intent.ts`, `api/_lib/ai.ts`, `aiGrounding.ts` and
`untrusted.ts`. Statuses as in MASTER_AUDIT_REPORT.md. No live AI request was
made for this report.

## How it works today

- **Six agents, one endpoint.** Search, GIS, Property, Navigation, Travel and
  Make My Trip all call `POST /api/ai/agent`. Each has one "focus" sentence;
  each returns a 3 to 5 sentence card.
- **Where the facts come from.** The browser sends the whole context: place
  name, address, property classification, counts, weather, route and
  officials. The server cleans it and fences it against prompt injection, but
  fetches nothing itself.
- **Sources.** The "sources" list under an answer is worked out from which
  fields the browser sent (`dataSourcesFor`), not from what the server
  retrieved.
- **Models.** OpenRouter free models in a fixed order (Gemma 4 31B, Nemotron
  3.5 Lightning, Gemma 4 26B), then OpenRouter's random free router. Answers
  are capped at 1,600 tokens; leaked `<think>` text is removed.
- **Limits.** 15 AI requests a minute per IP, shared by copilot, agents and
  intent, stored in Postgres so it survives cold starts.
- **Good parts to keep.** The intent parser only picks one map operation and
  never counts or describes; the app runs the operation on real data. The
  prompt-injection fence, the 20 KB context cap, and declining personal
  questions about the owner.

## Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| AI-01 | High | Browser-sent context is presented to the model, and then to the reader, as verified data. This includes officials: the browser marks each one "verified", and the prompt tells the model that list is the only source of truth. Anyone can make the AI state false facts "with sources" in their own browser, and a client bug (stale context after switching places) would do the same by accident. Answers are not shared or cached, so it does not reach other visitors. | VERIFIED, NOT FIXED |
| AI-02 | High for launch | OpenRouter's free models allow 20 requests a minute and 50 a day, raised to 1,000 a day once $10 of credits has ever been bought; failed attempts count too. One key serves every visitor, and running all six agents on one place uses 6 requests. | VERIFIED from OpenRouter's documentation (https://openrouter.ai/docs/api/reference/limits). The account's tier: NEEDS MANUAL VALIDATION |
| AI-03 | Medium | Only the prompt asks the model not to invent numbers. Nothing checks that a number in the answer appears in the data. | VERIFIED, NOT FIXED |
| AI-04 | Low | Answers carry the time they were written, not when each fact was retrieved, so they cannot say "as of". | VERIFIED, NOT FIXED |

## What fixes them

`docs/agents/IMPLEMENTATION_PLAN.md`: the server fetches the facts itself (or
reuses its own cached answers), the model only explains evidence it is given,
every number is checked against that evidence, and each finding carries its
source and retrieval time. Phases 1 and 2 of that plan fix AI-01, AI-03 and
AI-04 without changing the screens much. AI-02 is an account decision.

## Live tests

None yet. The six acceptance scenarios and the multi-agent task in the agent
brief need real provider calls; they will be run and recorded in
`docs/agents/TEST_RESULTS.md` once the plan is approved.
