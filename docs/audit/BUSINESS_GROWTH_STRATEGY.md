# Business and Growth Strategy

Every number here that is not from your own site is either cited or labelled as a hypothesis. There are no promised outcomes: the plan is a set of experiments with pass/fail lines.

## 1. The strategic reality

- **The generic use case is taken.** Google Maps now answers questions about places with Gemini (reported March 2026, [Republic World](https://www.republicworld.com/tech/google-maps-gets-gemini-upgrade-you-can-now-ask-anything-about-any-place)). "Ask a map a question" won't win users from Google on its own.
- **The India property-location space has free incumbents.** Sites like [Houssed](https://houssed.com/location-review) publish free locality guides covering connectivity, amenities and prices. Location-intelligence SaaS abroad charges real money, for example [Smappen](https://www.g2.com/products/smappen/pricing) lists plans from $99 to $399 a month. So people do pay for location analysis, and in India the free alternatives are content-led, not tool-led.
- **What maNOWj does that those don't:** for *any* point (not just a pre-written locality), it counts what is within a chosen radius, gives distances, shows the source and date of each figure, and prints a report. That is the product. Everything else (games, AI chat, travel links) is a feature around it.

**Positioning:** *"An evidence-based neighbourhood check for any address, in seconds."*

## 2. Customers, ranked by realistic fit

| Segment | Real need | Fit today | Willingness to pay (hypothesis) | Verdict |
|---|---|---|---|---|
| Home buyers and renters (India metros) | "What's near this flat? How far is the hospital, school, metro?" | Strong for amenities and distance; no price, legal or safety data | Low per person, one-off | **Acquisition engine** (free) |
| Real-estate agents and brokers | Professional-looking "what's nearby" sheet for each listing, fast | Strong once the report is branded | Moderate, recurring | **First paying segment to test** |
| Small developers and builders | Location highlights for brochures and listings | Same as agents | Moderate, per project | Test with agents |
| Retail and franchise site checks | Competitors and anchors near a site | Partial (no footfall or demographics) | Higher, but they expect demographic data | Later (P2) |
| Urban planners and infrastructure teams | Authoritative, current, complete data | Weak: OSM completeness varies; no official datasets | High, but long sales cycles and procurement | Not now |
| Researchers and students | Free data, citations | Good | Near zero | Free users, good for links and content |

## 3. Monetisation: validate before you build payments

You were right not to add payments yet.

**What stays free forever:** search, the map, nearby counts, routing, weather, the basic printable report, Ask maNOWj with a daily limit. That's the acquisition engine, and it costs little per user.

**What could earn, in the order to test:**

1. **Branded report for agents (concierge test, weeks 2 to 4).**
   - Offer: "Your logo, your contact, your listing's address → a one-page sourced neighbourhood sheet."
   - Deliver it manually at first from the existing `AreaReport`, with no payment system: UPI or bank transfer and an invoice.
   - Test price points (hypotheses): ₹199 per report, ₹1,499 a month for 20 reports.
   - **Pass line:** 3 agents pay in 30 days.
2. **Pro plan for individuals (only if 1 passes).** Saved places, comparisons, more AI questions, no daily limits. Needs accounts first (P2).
3. **API and enterprise:** not before there are 10 paying customers. An API on top of services whose terms forbid commercial use (SECURITY_AUDIT.md S-01) isn't sellable.
4. **Team collaboration:** not until a paying customer asks for it.

**Two blockers before the first rupee:**
- **Data terms (S-01):** commercial use breaks the OSRM demo and Open-Meteo free terms. Budget for commercial plans or self-hosting before charging.
- **Your employment contract:** you work in GIS operations on a mapping project. Before taking paying customers for a maps product, read your contract's outside-business-activity and conflict-of-interest clauses, and get written clearance if needed. This is the same concern your manager raised about using third-party sites, and it matters more once money is involved.

## 4. First 1,000 genuine users

**Definition:** a genuine user has at least one completed search or analysis. Page views don't count. This needs the `search_completed` event (TECHNICAL_ISSUES.md T-08) before anything is promoted.

| Channel | Experiment | Effort | Success line (30 days) | Why |
|---|---|---|---|---|
| Reddit (r/hyderabad, r/bangalore, r/india, r/IndianRealEstate) | A genuinely useful post: "I built a free tool that shows what's within 1 km of any address, with sources. Here's Gachibowli vs Kondapur." Answer every comment. | Low | 150 genuine users from Reddit-tagged links | Locality debates are constant there; show, don't pitch |
| LinkedIn | 3 posts: (1) the build story, (2) one locality report screenshot, (3) "what maps cannot tell you before you buy" | Low | 100 genuine users; 5 business enquiries | Your network includes GIS and real-estate-adjacent people |
| Instagram / YouTube Shorts | 30-second screen recording: "Is this flat near a hospital? Check in 10 seconds." | Medium | 100 genuine users | Visual product; short demos work |
| Organic search | Deploy the per-page HTML fix, then `/neighbourhood-report` and one checklist guide | Medium | Impressions growing week on week in Search Console (rankings take months; no promise) | Compounding channel |
| Real-estate agents (direct) | Message 20 agents in Hyderabad with a free branded sample for one of their listings | Medium | 5 replies, 3 trials | Tests the paying segment directly |
| WhatsApp sharing (referral) | "Share this report" with a link back to the address view | Low (already have share links) | 15% of reports shared | Every share is a new user's first view |
| Product Hunt | Skip for now | n/a | n/a | A global launch audience for an India-specific tool gives vanity traffic, not users |
| Developer communities (r/webdev, dev.to) | One technical write-up (MapLibre, free data stack) | Low | Backlinks, not users | Good for SEO authority; label as such |

**Tracking:** use UTM tags on every link (`?utm_source=reddit&utm_campaign=gachibowli`), and the weekly dashboard below.

## 5. Analytics: events and dashboard

Events to have (★ = missing today):

| Event | Fires when | Status |
|---|---|---|
| `page_view` | GTM default | Exists (after consent) |
| `search_started` | Query submitted | Exists |
| `search_completed` (`results`, `ms`) | Results shown | ★ |
| `search_failed` | Error or zero results | Exists (error only; add zero results) |
| `place_opened` | Result selected | Exists |
| `analysis_completed` (`radius`, `categories`, `ms`) | Nearby counts shown | ★ (new) |
| `ai_question_asked` / `ai_question_failed` (`model`, `ms`) | Copilot | ★ |
| `report_printed` | Print or PDF clicked | ★ (new) |
| `result_shared` | Share link | Exists |
| `business_enquiry_submitted` | New `/business` form | ★ (new) |
| `feedback_submitted` | Feedback form | ★ |
| `returning_user` | GA4 handles this; no custom event | n/a |
| `user_registered` | Only once accounts exist | Later |

**Weekly dashboard** (GA4 Explorations, or a Looker Studio sheet off GA4):

| Metric | Definition | First target (hypothesis) |
|---|---|---|
| Weekly active users | Users with ≥ 1 `search_completed` | 250 by day 30 |
| Activation rate | Users with `analysis_completed` ÷ new users | 35% |
| Search success rate | `search_completed` ÷ `search_started` | ≥ 85% |
| AI success rate | asked − failed, ÷ asked | ≥ 90% (needs paid fallback) |
| Week-1 retention | Returned within 7 days ÷ new users | 15% |
| Report rate | `report_printed` ÷ `analysis_completed` | 10% |
| Qualified leads | Business enquiries from a real business email | 5 per month |
| Revenue | Paid reports | First ₹ within 30 days, or a clear "no" |

Consent-gated analytics will undercount, and that's fine: track the trends, not the absolute numbers.
