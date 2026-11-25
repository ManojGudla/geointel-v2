# Production readiness

25 November 2026, against the audit brief's final acceptance criteria. A
passing build or test suite alone does not make the product ready.

| Criterion | State | Status |
|---|---|---|
| Zero TypeScript errors | `tsc -b` clean | VERIFIED |
| No failing unit or integration tests | 148 files, 1,530 tests pass | VERIFIED |
| No failing critical end-to-end tests | 4 journeys at phone and desktop size, API stubbed (`npm run e2e`), run in CI: 8 passed | FIXED, TESTED (mock). Journeys against live providers: NEEDS EXTERNAL ACCESS |
| No known critical or high exploitable security defects | None in code that runs for visitors; dev-tooling advisories mitigated, upgrades pending | VERIFIED (SECURITY_REPORT.md) |
| No known critical GIS calculation defects | Population units, self-crossing areas, off-globe coordinates and partial Overpass answers fixed | FIXED, TESTED. Real data: NEEDS EXTERNAL ACCESS |
| No exposed credentials | None in git or in the browser bundle | VERIFIED. Vercel logs: NEEDS EXTERNAL ACCESS |
| No broken primary user journeys | Search, map tap, panels, measuring, game: unit tests and headless checks pass | NEEDS MANUAL VALIDATION on a real phone |
| No broken mobile layouts | 100dvh, safe areas, sheet heights, touch targets fixed | FIXED. Real phones: NEEDS MANUAL VALIDATION |
| No unhandled critical API failures | Providers fail with a clear 502, mirrors and fallbacks, no failure cached as a fact | VERIFIED |
| AI responses grounded in available evidence | On `agents-v2`: server-fetched evidence, citations, number check, confidence from sources (AI-01, AI-03, AI-04) | FIXED, TESTED with mock providers. Live: NEEDS EXTERNAL ACCESS |
| Map rendering and recovery validated | Not stress-tested | NOT FIXED |
| SEO and deployment configuration validated | The canonical `www` host and the apex redirect were checked live; canonical tags and the sitemap are guarded by a test; a full SEO review is not done | Partly VERIFIED |
| External dependencies and limits documented | Providers, AI quota, imagery limits documented in these reports | VERIFIED |

**Verdict: not production-ready yet.** The blockers are the live agent
acceptance run (`scripts/agent-acceptance.mjs` against a preview), a check
on a real phone, and the AI quota (AI-02) if the site gets traffic.

## End-to-end tests

`npm run e2e` runs `tests/e2e/` against `vite preview` (build first) at
390x844 and 1280x800, with the API stubbed and labelled as mock. Locally,
`PW_CHROME=/path/to/chrome npm run e2e` uses an installed Chrome; CI installs
Playwright's own Chromium. Not covered yet: search typing, map taps and
measuring by touch, which need a map that renders tiles.
