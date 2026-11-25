# Production readiness

25 November 2026, against the audit brief's final acceptance criteria. A
passing build or test suite alone does not make the product ready.

| Criterion | State | Status |
|---|---|---|
| Zero TypeScript errors | `tsc -b` clean | VERIFIED |
| No failing unit or integration tests | 148 files, 1,530 tests pass | VERIFIED |
| No failing critical end-to-end tests | There is no end-to-end suite yet | NOT FIXED |
| No known critical or high exploitable security defects | None in code that runs for visitors; dev-tooling advisories mitigated, upgrades pending | VERIFIED (SECURITY_REPORT.md) |
| No known critical GIS calculation defects | Population units, self-crossing areas, off-globe coordinates and partial Overpass answers fixed | FIXED, TESTED. Real data: NEEDS EXTERNAL ACCESS |
| No exposed credentials | None in git or in the browser bundle | VERIFIED. Vercel logs: NEEDS EXTERNAL ACCESS |
| No broken primary user journeys | Search, map tap, panels, measuring, game: unit tests and headless checks pass | NEEDS MANUAL VALIDATION on a real phone |
| No broken mobile layouts | 100dvh, safe areas, sheet heights, touch targets fixed | FIXED. Real phones: NEEDS MANUAL VALIDATION |
| No unhandled critical API failures | Providers fail with a clear 502, mirrors and fallbacks, no failure cached as a fact | VERIFIED |
| AI responses grounded in available evidence | Browser-sent data is treated as fact (AI-01) | NOT FIXED: plan awaiting approval |
| Map rendering and recovery validated | Not stress-tested | NOT FIXED |
| SEO and deployment configuration validated | The canonical `www` host and the apex redirect were checked live; canonical tags and the sitemap are guarded by a test; a full SEO review is not done | Partly VERIFIED |
| External dependencies and limits documented | Providers, AI quota, imagery limits documented in these reports | VERIFIED |

**Verdict: not production-ready yet.** The blockers are AI grounding (AI-01),
no end-to-end tests, no real-phone check, and the AI quota (AI-02) if the site
gets traffic.

## Setting up end-to-end tests

Playwright works in this environment with the system Chrome
(`playwright-core` and `executablePath: "/usr/bin/google-chrome"`), which is
how the Fly maNOWj screenshots were taken. The plan: add `@playwright/test`,
cover search, map tap, the AI tab, measuring and the game at 390×844 and
1280×800, and run them in CI against `vite preview` with providers stubbed,
labelled as mock tests. Separate live checks run against the Vercel preview.
