# maNOWj GeoIntel Intelligence Suite: implementation plan

Status: **proposal, waiting for approval.** Nothing in this plan is built yet.
It will be built on its own branch (`agents-v2`), in phases, each checked on a
Vercel preview before the next starts.

## What exists today (inspected 25 November 2026)

- The six agents are one endpoint, `POST /api/ai/agent`, with one focus
  sentence each. They fetch nothing: every fact comes from the browser
  (AI_RELIABILITY_REPORT.md, AI-01).
- The data APIs are real and reusable: `geocode`, `reverse-geocode`, `gis`,
  `nearby`, `population`, `officials`, `weather`, `live`, `route`, `imagery`.
- The intent parser (`ai-intent`) only picks a map operation. Keep it.
- The hard limit: OpenRouter's free models allow 50 requests a day for the
  whole site, or 1,000 after $10 of credits has ever been bought. So the
  design uses **one model call per question**, however many agents take part.

## Design

1. **Evidence layer (server).** One record type for every fact:
   `{ id, agent, kind, label, value, unit, source {name, type, url},
   retrievedAt, confidence {level, method}, limitations }`, where `kind` is
   retrieved, computed, interpretation, estimate or unavailable. Tools wrap
   the existing route code (moved into shared service functions; the routes
   keep their behaviour and caches).
2. **Trust boundary.** An agent request carries only the anchor (coordinates
   or a search text), radius, route ends and trip settings. The server
   fetches every fact itself. Nothing else the browser sends is shown to the
   model as fact.
3. **Agents = tools + computation; the model only explains.**
   - Search: candidates from Nominatim and Photon, with match confidence,
     alternatives when ambiguous, and the administrative area.
   - GIS: Overpass counts and the distance to the nearest of each kind
     (computed), population with units, coverage and partial-answer flags.
   - Property: the existing classifier run on server-fetched evidence, with
     the evidence breakdown. No value, ownership or legal claims.
   - Navigation: the routing provider's route, alternatives and turn list
     where it returns them, with provider and time. No traffic.
   - Travel: Open-Meteo forecast with its timestamps; attractions from
     OpenStreetMap; side-by-side comparison of two places.
   - Make My Trip: stops from OpenStreetMap by interest, ordered by real
     travel times from the routing provider, split into days, editable. Prices
     only as clearly labelled estimates with their assumptions.
4. **Orchestrator.** `POST /api/ai/ask` turns a request into a plan (local
   parser first, the intent model only when needed), runs the tools in
   parallel within the function's time limit, then makes the one model call.
   Before the answer is shown, every number in it must match an evidence
   value; a sentence that fails is dropped. If too little evidence is left,
   the answer is "Insufficient verified data to provide a reliable
   conclusion." The timeline shown to the user lists the real server steps
   with their timings, nothing simulated.
5. **Answer format.** `{ answer, findings [{text, evidenceIds, agent}],
   evidence, unknowns, confidence + method, timeline, model }`. The screen
   labels each finding Verified, Computed, AI interpretation, Estimate or
   Unavailable, and shows which agent produced it.
6. **Screens.** An "Intelligence Suite" workspace opened from the AI tab,
   sharing the map and the selected place with the rest of the app. Nothing
   existing is removed. On phones it uses the bottom sheet.

## Phases

| Phase | Delivers | Fixes |
|---|---|---|
| P1 | Evidence layer and trust boundary for the six existing agent cards | AI-01 |
| P2 | Structured answers, the number check, source and "as of" chips in the cards | AI-03, AI-04 |
| P3 | Orchestrator, timeline, the multi-agent task | |
| P4 | Agent upgrades: route alternatives, destination comparison, the Make My Trip builder | |
| P5 | The Intelligence Suite workspace, the four `docs/agents` documents, live acceptance tests, screenshots | |

P1 and P2 on their own fix the trust problem.

## Decisions needed

1. Approve all phases, or P1 and P2 first.
2. AI quota: stay at 50 answers a day for the whole site, or buy $10 of
   OpenRouter credits once (1,000 a day).
3. Where the suite opens: a new workspace from the AI tab (recommended, so
   nothing existing moves) or in place of the AI tab.

## What it will not do, and says so on screen

Traffic, road closures, prices, opening hours, availability, bookings,
ownership, valuation, approvals. Land cover and elevation are shown only if a
provider for them is added and approved.
