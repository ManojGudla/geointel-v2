# SEO Audit

**Data limits.** I had no access to Google Search Console or any keyword-volume tool, and the PageSpeed Insights API was unreachable from the audit environment. Nothing below states a search volume, a ranking or an indexed-page count. Raw HTML was fetched from the live site on 6 November 2026, and Lighthouse SEO was run against the production build.

## 1. Technical SEO

| Check | Result | Evidence | Priority |
|---|---|---|---|
| robots.txt | Good | `public/robots.txt` allows everything except `/admin` and links the sitemap | n/a |
| XML sitemap | Good, slightly stale | 23 URLs (home, `/ai-map-search`, 12 cities, 9 comparisons), all `lastmod` 2026-09-13 | P2: regenerate `lastmod` at build time |
| Canonical URLs | **Broken (live)** | Raw HTML of all 23 sitemap URLs (except `/`) said `<link rel="canonical" href="https://www.manowj.com/">` and the title "maNOWj GeoIntel". JavaScript corrected it later. | **P0, fixed on `audit/v3.2`** |
| Titles and descriptions per page | Broken in raw HTML, fine after JS | same cause | P0, fixed |
| HTTP status codes | **Soft 404s** | `/this-page-does-not-exist` returns **200**; the app then renders a "not found" page | P1 |
| `/admin` noindex | Only after JS (and robots.txt) | raw HTML had `index, follow` | Fixed on branch (`noindex, nofollow` in its prerendered HTML) |
| Redirects | Not tested | apex → www and http → https could not be checked from the audit environment | Needs testing: `curl -sI http://manowj.com` should 301 to `https://www.manowj.com/` |
| H1/H2 hierarchy | Good | one H1 per page in the fallback and the app; Lighthouse SEO 100 | n/a |
| JavaScript rendering | Risky before the fix | the content and metadata of every non-home page depended on JS | Fixed by prerendering |
| Internal linking | Weak | the app home has no crawlable links to city or compare pages; city pages are mostly reachable through the sitemap | Improved: each prerendered city page now links to all cities and its comparisons. P1: add a footer link list to `/` |
| Structured data | Good | WebApplication in `index.html`, FAQPage on `/ai-map-search`, WebPage and BreadcrumbList on city and compare pages; FAQ deliberately not faked on city pages | n/a |
| Open Graph / X cards | Good | 1200×630 `og-image-v3.jpg`, titles and descriptions; per-page values are now in the raw HTML | n/a |
| Image alt text | Passes Lighthouse | `image-alt` passes on home | n/a |
| Mobile-first | Good | responsive, viewport set, tap targets mostly fine (one `target-size` failure) | P1 |
| Core Web Vitals | Lab only: LCP 4.4 s, TBT 1.49 s, CLS 0 | see PERFORMANCE_AUDIT.md | P1 |
| Homepage title | Weak | "maNOWj GeoIntel" says nothing to someone who hasn't heard of it | P1 |
| Search Console | Unknown | a Google verification file exists (`public/googleb676b63b365dcfba.html`), so a property was set up; data not available to me | Your action |

### Fix for soft 404s (needs your approval: it changes production config)

Replace the single catch-all rewrite in `vercel.json` with rewrites for known app paths only. Unknown paths would then get `dist/404.html` with a real 404 status. The build already writes that file.

```json
"rewrites": [
  { "source": "/", "destination": "/index.html" }
]
```

`/maps/*`, `/compare/*`, `/ai-map-search`, `/status`, `/admin` and `/privacy` are now real files, so they need no rewrite. Shared links like `/?lat=..&lon=..` still hit `/`.

Before applying this, test it on a Vercel **preview** deployment:
- `/maps/hyderabad` returns 200 with its own canonical;
- `/nope` returns 404;
- a reload on `/` with query parameters still works.

## 2. Keyword strategy (hypotheses, not measured)

**The market changed in 2026.** Google Maps now answers questions about places with Gemini ("Ask Maps", reported March 2026: [Republic World](https://www.republicworld.com/tech/google-maps-gets-gemini-upgrade-you-can-now-ask-anything-about-any-place)). A new site will not outrank Google for generic "ask a map" queries, and it shouldn't try. The winnable intent is **"check a specific locality or address before deciding to live, rent, buy or open there"**, where an evidence-backed, printable summary is a different product from a chat answer.

| Cluster | Example queries (to validate) | Intent | Fit today |
|---|---|---|---|
| Locality check before buying or renting | "how to check a locality before buying a flat", "<locality> neighbourhood review", "is <locality> good to live" | Research, high value | Strong for amenities and distances; weak for prices and safety (data not available) |
| Nearby facilities | "hospitals near <locality>", "schools within 2 km of <area>", "metro station near <apartment>" | Navigational / local | Strong, but Google Maps competes directly; win with radius counts and a printable report |
| Location intelligence (B2B) | "location intelligence tool India", "site selection tool for retail store" | Commercial | Partial: radius analysis exists, but no footfall or demographics |
| Satellite imagery | "satellite image of <place> by year", "old satellite images India" | Informational | Good: imagery history back to 2012 exists in Layers |
| City comparison | "<city a> vs <city b> to live", "<city> population density" | Informational | Exists (9 featured pairs, 66 renderable) |
| AI map search | "AI map search", "ask questions about a location" | Informational | Exists (`/ai-map-search`), but competes with Google |

**How to validate (week 1):** run Search Console's Performance report for the last 3 months, then Google Keyword Planner for monthly ranges, then Google autocomplete for "<locality> + is it good" in Hyderabad and Bengaluru. Write pages only for clusters that show real queries.

## 3. Landing-page architecture

Rules: one page per real job, no city × feature multiplication (the existing sitemap comment already says this, and it's right), every page with a working tool embedded and a source list.

| URL | Primary keyword (to validate) | Intent | SEO title | Meta description | H1 | Structure | Internal links | CTA |
|---|---|---|---|---|---|---|---|---|
| `/` | locality check map | Mixed | Check any address before you rent or buy · maNOWj | See what's within walking distance of any address: hospitals, schools, metro, shops. Free, with sources and dates. | Check any address in seconds | Search box first; three example addresses; how it works; sources | city pages, `/neighbourhood-report`, `/business` | Search an address |
| `/neighbourhood-report` | neighbourhood report India | Research | Free neighbourhood report for any address · maNOWj | Hospitals, schools, transit and daily needs within 1 km of an address, with distances and sources. Print or save as PDF. | Neighbourhood report for any address | Embedded search → printable report (`AreaReport`); sample report image; FAQ (real) | `/maps/*`, `/business` | Get my report |
| `/how-to-check-a-locality-before-buying` | how to check locality before buying flat | Informational | How to check a locality before buying a flat (checklist) | A practical checklist: distances, daily needs, connectivity and what maps cannot tell you (legal status, prices). | How to check a locality before you buy | Checklist; what our tool covers vs not; links to RERA and land records | `/neighbourhood-report` | Run the checklist on an address |
| `/maps/<city>` (exists) | <city> map / localities | Informational | (existing) | (existing) | (existing) | Add a "popular localities" section that links into the report | other cities, comparisons | Check an address in <city> |
| `/satellite-imagery` | satellite image by year | Informational | See any place by satellite, year by year · maNOWj | Compare satellite views of any location over time, with the capture date shown. | Satellite imagery, year by year | Embedded timeline; sources (Esri, NASA GIBS) | `/maps/*` | Open satellite view |
| `/business` | location intelligence tool India | Commercial | Location reports for agents, developers and retailers · maNOWj | Branded neighbourhood reports and radius analysis for your listings or site visits. Request a pilot. | Location reports for your business | Use cases; sample report; data sources and limits; enquiry form | `/use-cases/*` | Request a pilot |
| `/use-cases/real-estate-agents` | neighbourhood report for property listing | Commercial | Neighbourhood reports for property listings · maNOWj | Add a sourced "what's nearby" report to every listing in one click. | Neighbourhood reports for your listings | Problem, workflow, sample, pricing test, form | `/business` | Request a sample |
| `/use-cases/retail-site-selection` | retail site selection tool | Commercial | Quick site checks for a new store · maNOWj | Count competitors, footfall anchors and transit near any site before you visit. | Check a site before you visit | Same pattern | `/business` | Request a pilot |
| `/resources` | n/a (hub) | Mixed | Guides and data sources · maNOWj | How the data works, what it can and can't tell you, and practical location guides. | Resources | Data-source page, methodology, guides | all of the above | n/a |

Don't build pages for "route planner", "nearby places" or "AI map search" as separate competitive targets. Google dominates those queries, and the content would be thin. Keep them as app features linked from the pages above.

## 4. Implementation order
1. Deploy branch `audit/v3.2` (prerendered pages). Then in Search Console, request indexing for 3 city pages and submit the sitemap again.
2. Apply the 404 change on a preview deployment, test it, then promote it to production.
3. Change the homepage title and first screen (UI_UX_RECOMMENDATIONS.md).
4. Build `/neighbourhood-report` and `/business` together; they share the report and the enquiry form.
5. One guide per week, only for validated queries.
