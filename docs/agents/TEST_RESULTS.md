# Agent test results

25 November 2026, `agents-v2` branch. Three kinds of test, kept apart as the
brief requires: mock tests are labelled mock and do not count as acceptance.

## 1. Automated tests (MOCK providers and model)

Run with `npm test`. They check the agents' logic, not any provider's data.

| File | Tests | What it checks |
|---|---|---|
| `tests/unit/agentGrounding.test.ts` | 23 | Number check, citations, as-of handling, confidence levels, evidence table |
| `tests/unit/agentEvidence.test.ts` | 12 | Every source's evidence, failures and timeouts as unavailable, shared Overpass call, visitor headers passed on, route alternatives and turns |
| `tests/unit/aiAgentEndpoint.test.ts` | 13 | Anchor required; browser facts and forged officials never reach the model; no model call without a route; invented numbers removed |
| `tests/unit/aiGrounding.test.ts`, `copilotSources.test.ts` | 26 | The Copilot fetches its own facts, officials only when asked, nothing for personal questions, old pages still answered |
| `tests/unit/agentTeam.test.ts` | 14 | Planner, section split, nearest-hospital routing, one call per source, attribution, timeline, no model call when nothing to say |
| `tests/unit/tripPlan.test.ts` | 11 | Stop picking and ordering, measured hops, assumptions, unknown hops, over-full days, the visitor's own order |
| `tests/unit/agentEvidenceView.test.tsx`, `agentTeamView.test.tsx`, `tripBuilderView.test.tsx` | 20 | The screens: confidence, chips, evidence list, steps, the route button, editing a trip |

Whole suite on the last commit: **1,618 passed, 0 failed**; type check clean;
production build and contrast check pass.

## 1b. End-to-end journeys (MOCK API, real browser)

`npm run e2e` (Playwright; `playwright.config.ts`, `tests/e2e/`). The built
site runs in Chrome at phone size (390 x 844) and desktop size (1280 x 800),
with every /api call answered by `tests/e2e/fixtures.ts`.

| Journey | Phone | Desktop |
|---|---|---|
| Home page loads with no errors; search and All tools visible | pass | pass |
| A shared link opens the place in the AI section; the agents answer together; a citation opens its evidence; the route button appears | pass | pass |
| A provider outage (no fixture, 503) is reported by the trip builder, not hidden | pass | pass |
| Fly maNOWj: a crash shows the angry face (360 px image loaded) on the game-over card | pass | pass |

8 passed, 0 failed (Chrome for Testing 153, Playwright 1.62.1). CI now
installs Playwright's Chromium and runs these on every push and pull request.

## 2. Local run of the real stack (providers unreachable)

`scripts/agent-acceptance.mjs` was run against `vite` on this machine, with
the real API code and no mocks. This sandbox cannot reach OpenStreetMap,
Open-Meteo, the routing servers, Wikidata or OpenRouter, so this run shows
only how the agents behave when every provider is down:

| Test | HTTP | Result |
|---|---|---|
| All 7 scenarios | 200 | FAIL, as expected: every required fact came back `unavailable` with the provider's reason (for example "OpenStreetMap's free map-data servers are overloaded right now") |

No answer contained a number, no model call was made for an agent without
evidence, and the trip builder returned no stops rather than invented ones.
**This is not an acceptance pass.**

## 3. Live acceptance (real providers): NOT RUN, NEEDS EXTERNAL ACCESS

The brief's six scenarios and the multi-agent task need real provider
answers. Run them against a Vercel preview of this branch:

```
node scripts/agent-acceptance.mjs https://<preview>.vercel.app docs/agents/TEST_RESULTS.live.md
```

The script records, for each test, the input, the endpoint, the answer, every
evidence item with its source and time, what was missing, and PASS or FAIL.
A test passes only on real retrieved evidence. Commit the file it writes.

| Scenario | Endpoint | Passes when |
|---|---|---|
| 1. Search, ambiguous place | `/api/ai/agent` search | Matches and a best match are retrieved |
| 2. GIS, facilities and distances | `/api/ai/ask` | Counts within 1 km and the nearest hospital are retrieved |
| 3. Property | `/api/ai/agent` property | A classification and its confidence are computed |
| 4. Navigation | `/api/ai/agent` navigation | The routing provider's distance and time are retrieved |
| 5. Travel | `/api/ai/agent` travel | Current temperature and the place name are retrieved |
| 6. Make My Trip | `/api/ai/trip` | At least 2 stops with every hop measured |
| 7. Multi-agent | `/api/ai/ask` | Search, GIS, Property and Navigation all take part, with the nearest hospital and its route |
