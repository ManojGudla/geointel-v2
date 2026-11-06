# 30-Day Roadmap

Start date: the day branch `audit/v3.2` is merged. Each week ends with a check: if a week's success line isn't met, fix that before moving on.

"You" means decisions, accounts and outreach only you can do. "Build" means code work.

## Week 1: Make it measurable and indexable

| Day | Task | Who | Done when |
|---|---|---|---|
| 1 | Merge and deploy `audit/v3.2` (founder answers, per-page HTML, Nominatim pacing) | You | `curl -s https://www.manowj.com/maps/hyderabad \| grep canonical` shows `/maps/hyderabad` |
| 1 | Re-tag v3.2 on the right commit (TECHNICAL_ISSUES.md T-14) | You | `git ls-remote --tags origin` shows `v3.2^{}` at `3952852` |
| 1 | Search Console: submit the sitemap again; request indexing for `/maps/hyderabad`, `/maps/bengaluru`, `/ai-map-search` | You | Requests accepted |
| 2 | Add the missing analytics events (T-08) plus `analysis_completed` and `report_printed` | Build | Events visible in GA4 DebugView |
| 2 | Add CI: typecheck, tests, build on every pull request (T-11) | Build | A failing test blocks a merge |
| 3 | Rotate `GEOINTEL_ADMIN_KEY` to 32+ random characters; check Vercel Preview doesn't have the production key | You | Old key rejected |
| 3 | Buy $10 of OpenRouter credit; add one paid fallback model with a monthly cap (T-04) | You + Build | 20 test questions, 0 "busy" failures |
| 4 | Soft-404 fix on a Vercel preview, then production (SEO_AUDIT.md) | Build, you approve | `/nope` returns 404; all app URLs return 200 |
| 5 | Decide the geocoder for typeahead (T-03) and the commercial-data plan (S-01) | You | Written decision with cost |

**Week 1 success line:** events flowing; prerendered pages live; no AI "busy" errors in 20 test questions.

## Week 2: Make the value obvious

| Day | Task | Who | Done when |
|---|---|---|---|
| 8 | Homepage headline, subline and 3 example addresses; new homepage `<title>` (UI_UX U-2) | Build | 5 people who've never seen it can say what it does after 5 seconds |
| 8 | Free notice: first visit only, then a footer line (U-1) | Build, you approve | Lighthouse LCP element is no longer the notice |
| 9 | "Get printable report" button after every analysis (U-4) | Build | `report_printed` events appear |
| 10 | Sentry: DSN check plus slim import; remove `@sentry/tracing` (T-09) | Build | Sentry chunk gone when no DSN is set |
| 11 | Lazy-load `framer-motion` users (T-10) | Build | Entry chunk under 140 KB gzipped |
| 12 | Fix the `target-size` failure (U-7) | Build | Lighthouse accessibility 100 |

**Week 2 success line:** Lighthouse mobile Performance ≥ 75 on `/` (median of 3 runs); LCP ≤ 3 s in the lab.

## Week 3: A path for businesses

| Day | Task | Who | Done when |
|---|---|---|---|
| 15 | `/business` page with a 4-field enquiry form, stored in Supabase (new `business_enquiries` table, RLS deny-all, durable rate limit), shown in the admin console | Build | Test enquiry visible in admin |
| 16 | `/neighbourhood-report` page built around the existing report | Build | Prerendered with its own canonical |
| 17 | Data-sources page (`/resources/data-sources`): provider, purpose, update frequency, limits | Build | Linked from every AI answer |
| 18 | Branded report option (logo, name, phone) for the agent test | Build | Sample PDF for a real listing |
| 19 to 21 | Message 20 Hyderabad agents with a free branded sample | You | 5 replies |

**Week 3 success line:** 3 agents trying the branded report; 5 business enquiries in total.

## Week 4: Acquire and learn

| Day | Task | Who | Done when |
|---|---|---|---|
| 22 | Reddit post (r/hyderabad or r/bangalore) with a locality comparison, UTM-tagged | You | Posted; replied to every comment within 24 h |
| 23 | LinkedIn post: build story plus report screenshot | You | Posted |
| 24 | 30-second screen-recording short (Instagram / YouTube Shorts) | You | Posted |
| 25 | One checklist guide: "How to check a locality before buying" | Build + you | Live and in the sitemap |
| 26 | IP-address retention job (null after 30 days) plus Privacy panel line (S-04) | Build | Job scheduled |
| 27 | `maplibre-gl` 6.x upgrade on a branch, with before/after Lighthouse (S-05) | Build | No regressions; advisory closed |
| 28 to 30 | Review the dashboard; write down what worked, what didn't, and the next 30 days | You | One-page review |

**Day-30 success lines** (from BUSINESS_GROWTH_STRATEGY.md; hypotheses to test, not promises):
- 250 weekly active users (users with a completed search)
- Search success ≥ 85%, AI success ≥ 90%
- 5 qualified business enquiries
- 3 agents paying for branded reports, or a clear reason why not

## Not in these 30 days (on purpose)
Accounts, payments, public API, team workspaces, native apps, new games, more AI agents. None of them helps reach the day-30 lines, and several depend on the data-terms decision.
