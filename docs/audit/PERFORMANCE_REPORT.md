# Performance report

25 November 2026. Only what was actually measured is reported as a number.

## Measured: production bundle

`npm run build` (Vite 5.4.21), last commit of v3.4. Sizes from Vite's own
output.

| File | Raw | Gzip | Loaded |
|---|---|---|---|
| `index-*.js` (entry) | 599.8 kB | 192.6 kB | On every page |
| `index-*.css` | 142.6 kB | 20.0 kB | On every page |
| `maplibre-gl-*.js` | 802.1 kB | 217.8 kB | When the map loads |
| `index-*.js` (second shared chunk) | 493.2 kB | 163.1 kB | When imported |
| `PlayHub-*.js` | 159.2 kB | 54.2 kB | Games only |
| `LandingPage-*.js` | 28.4 kB | 9.1 kB | Landing page |
| All 41 JS and CSS files | 2,568 kB | 747 kB | |

The home page HTML references only the entry script and the main stylesheet;
there are no other preloaded scripts.

v3.4 does not change these sizes in any meaningful way: it adds small
functions and a 13.6 kB face image that loads only in the game.

## Not measured yet

| Metric | How to measure |
|---|---|
| LCP, INP, CLS on a mid-range Android phone | Lighthouse (mobile) on www.manowj.com, or Vercel Speed Insights |
| Time to first map tile | Chrome DevTools Performance panel on 4G throttling |
| API latency per provider, cache hit rate | Vercel function logs and the `x-vercel-cache` header |

## Effects of v3.4 on load

- Requests with coordinates off the globe now stop before any provider call.
- Overpass answers that were cut short are no longer cached, so an
  overloaded Overpass is asked again rather than a partial answer being
  served for the cache lifetime. Deliberate.

## Next step

Run a bundle analysis (for example `rollup-plugin-visualizer`) to see what
makes the entry chunk 192.6 kB gzip before deciding what to split.
