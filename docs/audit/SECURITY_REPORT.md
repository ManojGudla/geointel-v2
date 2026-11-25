# Security report

25 November 2026. Re-checks the earlier `SECURITY_AUDIT.md` (S-01 to S-08)
against the current code, plus new checks. Statuses as in
MASTER_AUDIT_REPORT.md. No secret value was printed or stored while checking.

## Summary

No exploitable critical or high-severity defect was found in code that runs
for visitors. The critical and high npm advisories are in development and test
tooling, or (maplibre-gl) in a function this version does not contain. Two
items need the owner: the admin key's strength and IP retention.

## Checks

| ID | Check | Result | Status |
|---|---|---|---|
| N-01 | Secrets committed to git | Searched every tracked file for OpenRouter keys, generic `sk-` keys, JWTs, AWS keys, private keys and `service_role` values: none | VERIFIED |
| N-02 | Secrets in the browser bundle | Built `dist/` contains no key and not even the names of the server-only variables. The browser reads only `VITE_FOUNDER_SITE_URL`, `VITE_GTM_ID`, `VITE_SENTRY_DSN`, which are public by design | VERIFIED |
| N-03 | Content Security Policy | All 158 built HTML pages checked: no inline executable script, so `script-src 'self'` plus Google Tag Manager holds | VERIFIED |
| N-04 | Server-side request forgery | Every server `fetch` goes to a fixed host. Visitor input only fills coordinates or encoded search text; the USGS feed name comes from a fixed pair | VERIFIED |
| N-05 | Open redirects | No redirect or `Location` header is built from request input | VERIFIED |
| N-06 | HTML injection (XSS) | No `dangerouslySetInnerHTML`; the one `innerHTML` assignment is a constant; map popups do not use `setHTML` | VERIFIED |
| N-07 | Input validation | Coordinates off the globe and blank values reached providers (A-02) | FIXED, TESTED |
| S-02 | Personal details in the AI prompt | Removed; the prompts now decline personal questions about the owner | VERIFIED (fixed earlier) |
| S-03 | Admin access | Fails closed when `GEOINTEL_ADMIN_KEY` is unset, compares in constant time, durable limit of 20 attempts a minute per IP, and the public GET no longer confirms a key | VERIFIED. Key strength: NEEDS MANUAL VALIDATION (use 24 or more random characters) |
| S-04 | IP addresses kept with submissions | No retention limit in the migrations | NOT FIXED: a clean-up job deletes data, so it needs the owner's approval |
| S-06 | Dev server on the whole Wi-Fi | `server.host` is now `"localhost"`; `npm run dev:phone` opens it to the LAN for one session | FIXED |
| S-07 | AI cost | Free models only, so no bill; the limit is the daily quota (AI-02). 15 AI requests a minute per IP across all AI routes; answers capped at 1,600 tokens | VERIFIED |
| S-08 | CORS | No `Access-Control-Allow-Origin` anywhere, so browsers on other sites cannot read the API. Scripts outside a browser are not stopped by CORS; rate limits are the protection there | VERIFIED |
| N-08 | Supabase row-level security | Every table in the six migrations enables RLS, with no policies and no grants to `anon` or `authenticated`: only the server's service role can read or write | VERIFIED from migrations. The live database: NEEDS EXTERNAL ACCESS |
| S-01 | Provider terms for commercial use | Not re-checked today | NEEDS MANUAL VALIDATION before charging money |

## Dependencies (D-01)

`npm audit` on 25 November 2026 reported 8 vulnerable packages: 3 critical,
2 high, 3 moderate.

| Package | Advisory | Runs for visitors? | Status |
|---|---|---|---|
| source-map-js 1.2.1 | GHSA-68fv-2mgg-jv7q (high): denial of service from crafted source maps | No, build tool | FIXED: 1.2.4 via `npm audit fix` (no major upgrades) |
| maplibre-gl 4.7.1 | GHSA-jrc7-96c5-q579 (critical): bypass in `DOM.sanitize()` | Yes, but not reachable | VERIFIED not reachable: 4.7.1 has no `DOM.sanitize`, and every attribution string is a constant in our code (no external styles or TileJSON). Upgrade to 6.x: NOT FIXED, own branch |
| vitest 2.1.9, tinypool, @vitest/mocker, vite-node | GHSA-5xrq-8626-4rwp (critical, Vitest UI server), tinypool prototype-pollution gadgets (critical), mocker path traversal and mock injection (moderate) | No, tests only | FIXED on the `deps-upgrade` branch: vitest 4.1.12 |
| vite 5.4.21, esbuild 0.21 | Path traversal and `fs.deny` bypasses, Windows launch-editor issues (high and moderate), esbuild dev-server CORS (moderate) | No, dev server only | FIXED on the `deps-upgrade` branch: vite 7.3.8, @vitejs/plugin-react 5 |

### The `deps-upgrade` branch

With npm 11 (`npx npm@11 install -D vite@^7.3.8 vitest@^4.1.12
@vitejs/plugin-react@^5`) the upgrade installed. On that branch: type check
clean, 1,618 unit tests pass, production build and prerender pass, contrast
check passes, the 8 end-to-end journeys pass, and `npm audit` reports one
remaining advisory: maplibre-gl, not reachable (above). `npm ci` with npm 10
installs from the new lockfile without error, so CI and Vercel are not
affected by the npm 10 bug. Two things to know: Vite 7 needs Node 20.19+ or
22.12+ on your computer, and its default browser target is newer, so the
old one (Safari 14, Chrome 87) is now written in `vite.config.ts` to keep
supporting the same phones.

### First upgrade attempt, 25 November 2026

`npm install -D vite@^7.3.8 vitest@^4.1.12 @vitejs/plugin-react@^5` was tried
on a throwaway branch. npm 10 (with Node 22) crashed while resolving
vitest 4's optional peer packages ("Cannot read properties of null (reading
'edgesOut')" in its peer-set solver), before anything was installed, also
from a clean `node_modules`. Nothing was changed: the attempt was discarded
and `npm ci` restored the locked versions. The `--legacy-peer-deps` way
around it was not used, because it would change how every later install
resolves packages, Vercel's included. Status: NOT FIXED.

## Next steps

1. Merge `deps-upgrade` after its Vercel preview checks out (it needs Node
   20.19+ or 22.12+ locally).
2. Upgrade maplibre-gl to 6.x on its own branch and re-check every map
   layer by hand.
3. Decide on IP retention (S-04): for example, clear IPs after 30 days.
4. Confirm the admin key is long and random; rotate it if not.
