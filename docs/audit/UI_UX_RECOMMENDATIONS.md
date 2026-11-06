# UI/UX and Conversion Recommendations

Based on the live site and the code as of v3.2, screenshots taken in this project at phone (390 px), laptop and desktop sizes, and Lighthouse accessibility (96/100). Every recommendation is tied to clarity, trust or conversion. None is purely cosmetic.

## The five-second test

**What a first-time visitor sees on `/` today:**
1. A large "free to use" pop-up (every visit, closes after 4 s).
2. Behind it, a map, a search box reading "Search a place or a question", and chips (Directions, What's here, Nearby, Measure, Petrol, ATM, Hospital, Food, Metro).

**What they understand in five seconds:** "a map site that is free". **What they don't understand:** why they would use this instead of Google Maps, which they already have open. The value that actually differs (counts within a radius, a printable report, the source and date on every figure) isn't said anywhere on the first screen.

**The fix is one sentence and one example, not a redesign:**

> **Check any address before you rent or buy.**
> See hospitals, schools, metro and daily needs within walking distance, with the source and date of every figure.
> [ Search an address… ]   Try: *Gachibowli, Hyderabad* · *Koramangala, Bengaluru* · *Andheri West, Mumbai*

On desktop, put this above the search box in the side panel. On mobile, put it in the bottom sheet's peek state. When the person searches, it collapses.

## Findings

| # | Finding | Evidence | Recommendation | Priority |
|---|---|---|---|---|
| U-1 | A pop-up on every visit | `freeNoticeStore.ts` opens it every time; it is the LCP element (PERFORMANCE_AUDIT.md) | First visit only, then a one-line footer note: "Free to use, including at work; please follow your employer's policies." Returning users are your best users; don't interrupt them | P1 |
| U-2 | No clear job-to-be-done | Homepage title "maNOWj GeoIntel"; placeholder "Search a place or a question" | The headline above; homepage `<title>` "Check any address before you rent or buy · maNOWj" | P1 |
| U-3 | No path for businesses | No pricing, demo or enquiry form; only "Join our team" and feedback | Add "For business" to the header More menu and to `/business` (SEO_AUDIT.md) with a 4-field enquiry form: name, work email, company, what you need | P1 |
| U-4 | The best output is hidden | `AreaReport` (printable report) exists but is reached from inside the analysis panel | After every analysis, show a "Get printable report" button; make the report the hero of `/neighbourhood-report` | P1 |
| U-5 | Founder and trust | Only the AI and the index fallback mention who built it | A short "Who built this" block on `/business` and `/about`: photo, one line, LinkedIn. Add a data-sources page listing each provider, what it is used for, and its update frequency | P1 |
| U-6 | Games dilute the product | Play hub and cricket in the main navigation; 149 KB chunk | Keep them under "More → Play". For business visitors they make the product look less serious | P2 |
| U-7 | Tap target too small | Lighthouse `target-size`: `.basemap-switcher__more` | Make it at least 24×24 px with spacing (44×44 recommended) | P1 |
| U-8 | Nothing to come back to | No saved places, history or account | P2: "Save this place" kept on the device (no account needed), then accounts later | P2 |
| U-9 | Feature tour exists, which is good | Tour fixed and verified in v3.2 | Trigger it from the empty state ("New here? Take the 30-second tour") rather than only from the menu | P2 |
| U-10 | AI answers can't be checked | Short chat answer with a generic "Based on" list | A collapsed "How we know" under each answer: facts, sources, fetch time (TECHNICAL_ISSUES.md T-06) | P2 |

## Recommended homepage structure (the brief's 10 items, applied honestly)

The app must stay the homepage: people arrive to use it, and an extra marketing click loses them. So the 10 items are split between the app's first screen and one scrolling page, `/business`.

| Item | Where | Notes |
|---|---|---|
| 1. Value proposition | App first screen | The headline and subline above |
| 2. Interactive product preview | App first screen | The app *is* the preview; the three example addresses make it one tap |
| 3. Primary CTA "Explore GeoIntel" | App first screen | The search box is the CTA; label the button "Check this address" |
| 4. Business solutions CTA | Header More menu, plus footer of the report | "For business" → `/business` |
| 5. Real-world use cases | `/business` | Home buyers and renters, real-estate agents, retail site checks. Only use cases the tool can do today |
| 6. Data-source transparency | `/resources/data-sources`, linked from every answer | Provider, purpose, update frequency, limits ("we do not have prices, legal status or crime data") |
| 7. Product screenshots | `/business`, `/neighbourhood-report` | A real report for a real address, not mock-ups |
| 8. Founder introduction | `/business`, `/about` | One paragraph, professional, LinkedIn link |
| 9. Documentation | `/resources` | How the radius analysis works; how to read the report |
| 10. Customer enquiry | `/business` | 4-field form stored in Supabase like `team_applications`, with the same rate limit and admin view (Team tab pattern) |

## Mobile
- The bottom sheet, live blue dot and near-me chips are in place (v3.2).
- Check on a real iPhone in Safari *and* in the WhatsApp/Instagram in-app browsers, since that is how shared links open. Location in in-app browsers is blocked, and the app already explains this (`src/features/location/locationHelp.ts`).
- Keep the free notice off mobile return visits (U-1). On a 390 px screen it covers everything.

## Accessibility
Lighthouse 96. Contrast for 66 colour pairs is checked by `scripts/check-contrast.mjs` in both themes. Remaining work: U-7 (`target-size`), and a screen-reader pass of the bottom sheet and the measure tool. Neither has been tested with VoiceOver; that needs testing.
