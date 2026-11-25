# Agent architecture

How the six agents, the Copilot and the team endpoint work, as built on the
`agents-v2` branch (25 November 2026). The rule everything follows: **the
browser says where to look; the server fetches every fact; the model only
explains facts it was given; every number it writes is checked.**

## Request flow

```
Browser (AI tab: team box, trip builder, six agent cards; Copilot chat)
  |  sends an ANCHOR only: { lat, lon, radiusMeters?, route ends?, search text? }
  v
/api/ai/agent  /api/ai/copilot  /api/ai/ask  /api/ai/trip      (rate limit: 15 AI requests/min/IP)
  |
  |  1. plan       planner.ts (team only): word rules pick agents + sources
  |  2. gather     gather.ts: one tool per source, in parallel, 8 s each
  |                  -> internalCall.ts runs this app's own API routes in-process:
  |                     reverse-geocode, gis, nearby, weather, route, geocode,
  |                     population, officials (their checks, caches, fallbacks
  |                     and per-visitor limits all apply)
  |  3. compute    property classification, nearest place, straight-line
  |                distances, trip ordering, day totals
  |  4. verify     grounding.ts: confidence per agent from which sources answered
  |  5. write      ONE model call (OpenRouter free models), evidence table fenced
  |                as data, citations [E3] required        (skipped when evidence
  |                is insufficient, and never used by /api/ai/trip)
  |  6. check      every sentence's numbers against the evidence; failures dropped
  v
Answer: { summary, findings[{text, evidenceIds}], evidence[], confidence,
          steps[{step, status, ms}], sources, model, generatedAt, removedSentences }
```

## Files

| File | Role |
|---|---|
| `api/_lib/evidence/internalCall.ts` | Runs an API route in-process with the visitor's headers; times out at 8 s |
| `api/_lib/evidence/gather.ts` | The tools (place, search, gis, property, population, weather, nearby, route, officials), shared lookups, `AGENT_TOOLS` |
| `api/_lib/evidence/grounding.ts` | Evidence table, number check, citations, confidence method, `INSUFFICIENT` |
| `api/_lib/evidence/planner.ts` | Request -> agents, sources, radius, "nearest X" |
| `api/_lib/evidence/trip.ts` | Make My Trip plans: stop picking, nearest-next order, measured hops |
| `api/_lib/evidence/anchor.ts` | Anchor validation, shared |
| `api/_routes/ai/agent.ts` | One agent on the selected place |
| `api/_routes/ai/copilot.ts` | Chat; fetches facts only for questions about the place, officials only when asked |
| `api/_routes/ai/ask.ts` | Several agents on one request; real timeline |
| `api/_routes/ai/trip.ts` | Trip plans; no model |
| `src/features/ai/AgentEvidence.tsx` | Confidence, findings with citation chips, evidence list, steps |
| `src/features/ai/AgentTeam.tsx`, `TripBuilder.tsx`, `AgentCard.tsx`, `ChatAnswer.tsx` | The screens |

## Budgets and limits

| Limit | Value | Why |
|---|---|---|
| Per source | 8 s | Overpass is the slow one; past this it is "did not answer" |
| Model, total | min(30 s, 37 s minus evidence time), at least 12 s | The browser waits 40 s |
| AI requests | 15 a minute per IP, shared by all AI routes, stored in Postgres | Cold starts cannot reset it |
| Trip plans | 10 a minute per IP | Each plan makes up to 9 routing calls |
| Model calls | 1 per question, including a team request | OpenRouter free models: 50 a day per account (1,000 after $10 of credits) |

## Failure handling

- A source that fails, times out or is rate-limited becomes an `unavailable`
  evidence item with the reason. Nothing is filled in.
- If every source an agent needs failed, the model is not called; the answer
  is the brief's sentence, "Insufficient verified data to provide a reliable
  conclusion.", plus the reason.
- A model failure (busy models, a used-up allowance, no key) returns the
  checked evidence with `aiUnavailable` set to the reason, no findings, and
  `model: "none: the AI could not answer this time"`. The screens say why
  there is no written answer, never label anything as AI interpretation, and
  open the evidence. Changed on 25 Nov 2026: the earlier `502 AI_UNAVAILABLE`
  threw away facts that had already been fetched and checked, so a busy free
  tier left every card showing only an error. The Copilot still answers
  `502` when a question had no facts behind it.
- OpenRouter's free-model limits belong to the account, not to a model: 20
  requests a minute and 50 a day (1,000 a day once 10 dollars of credits
  have been bought), shared by every free model, and failed attempts count
  towards the day. A 429 from those limits ends the request at once (asking
  another free model gets the same 429), and the server instance stops
  asking free models until the reset time OpenRouter gives (at most about a
  minute), or for 10 minutes after a used-up day, so bought credits are
  noticed. A 429 from one busy provider still moves on to the next model.
  See `rateLimitScope` in `api/_lib/ai.ts`.
- Questions about the app itself (the four suggestions shown before a place
  is picked, "what can you do", greetings, thanks, who built it) are answered
  by `api/_lib/appHelp.ts` without a model, before the AI rate limit, so they
  work whatever state the free AI is in and spend none of its allowance.
- A page from before this change: the agents answer `400 ANCHOR_REQUIRED`
  ("Reload the page"); the Copilot still answers, without place facts.

## Decisions

- **In-process route calls, not re-implementation.** One copy of each
  provider integration. Cost: the server may ask a provider again for data
  the browser already has (the agent cards still wait for the panels' own
  loads, so answers appear beside the numbers they explain). Signed evidence
  from the browser would avoid the repeat call; not built.
- **Word-rule planner, not a model.** Same plan for the same words, testable,
  free. It says so when it understood nothing.
- **One model call per request.** The free quota is per request.
