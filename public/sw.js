// Installability service worker: makes the app "Add to Home Screen"-able and
// lets it reopen instantly, without pretending to be a full offline app.
//
// v3 fixes a way this could brick the site completely, observed live on
// manowj.com. vercel.json used to rewrite EVERY non-API path to index.html,
// so a request for an asset hash that no longer existed came back as HTTP 200
// with content-type text/html. Two bad things followed:
//   1. The browser refuses HTML as a stylesheet or module, so the page
//      rendered blank with only a MIME error in the console.
//   2. This worker saw response.ok === true and cached that HTML under the
//      asset's URL. Because hashed assets are served cache-first, the poison
//      then survived every ordinary reload.
// The rewrite is fixed (assets now 404 honestly), and the two guards below
// make sure a worker that somehow meets an HTML-for-asset response again
// cleans itself up instead of persisting the damage.
//
// The cache name is bumped on purpose. The previous version was cache-first
// for EVERY GET, including the HTML document - so once a visitor had loaded
// the site, their browser served them that same index.html forever, pointing
// at the same old hashed bundle. Deploys went out and returning visitors kept
// seeing the previous build with no way to tell; only a hard refresh or a
// cleared cache broke the loop. Changing the name here forces the old,
// poisoned cache to be deleted on activate.
// v4: also clears the v3 cache, which kept every hashed file from every
// deploy forever because the name never changed.
const CACHE_NAME = "geointel-shell-v4";

/**
 * Cache the files a page needs to start: the scripts, styles and preloads
 * index.html points at.
 *
 * Before this, the app's own JavaScript was only cached the SECOND time it
 * was requested, because the first visit fetches it before this worker is
 * installed. So the first time someone went offline after one visit, the
 * cached page loaded with no script behind it and stayed blank. Reading the
 * references out of the HTML means one online visit is enough.
 *
 * Only files not already cached are fetched, so doing this on every online
 * page load costs nothing once they are there.
 */
/*
  Match on the URL alone. Scripts are requested with crossorigin, so the
  browser sends an Origin header, and servers answer with "Vary: Origin". A
  cached response then only matches a request carrying the same headers, so
  files fetched here (without them) were cached but never found, and the app
  still failed to start offline. Hashed files are content-addressed, and the
  fixed ones are the same for every origin, so Vary carries no meaning here.
*/
const MATCH = { ignoreVary: true };

async function cacheStartupFiles(cache, html) {
  const urls = new Set();
  // Every same-origin file the page points at: hashed bundles, plus the
  // handful of fixed ones (recovery.js, the manifest, icons). Pages it links
  // to come back as HTML and are skipped below.
  for (const m of html.matchAll(/(?:src|href)="(\/(?!\/)[^"#?]+)"/g)) urls.add(m[1]);
  await Promise.all(
    [...urls].map(async (u) => {
      if (await cache.match(u, MATCH)) return;
      try {
        const res = await fetch(u);
        if (res.ok && !isHtmlResponse(res)) await cache.put(u, res);
      } catch {
        // Offline or a bad deploy mid-flight: the next online visit retries.
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const res = await fetch("/", { cache: "no-cache" });
        if (res.ok && isHtmlResponse(res)) {
          await cache.put("/", res.clone());
          await cacheStartupFiles(cache, await res.text());
        }
        await cache.add("/manifest.json");
      } catch {
        // Installing offline still installs; the shell is cached next time.
      }
    })()
  );
  self.skipWaiting();
});

/*
  The page's list of app files it already has (see main.tsx). Only paths that
  look like our own hashed bundles are accepted, at most 100, and only files
  not already cached are fetched.
*/
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache-loaded-files" || !Array.isArray(data.urls)) return;
  const paths = data.urls.filter((u) => typeof u === "string" && /^\/assets\/[A-Za-z0-9._-]+$/.test(u)).slice(0, 100);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        paths.map(async (path) => {
          if (await cache.match(path, MATCH)) return;
          try {
            const res = await fetch(path);
            if (res.ok && !isHtmlResponse(res)) await cache.put(path, res);
          } catch {
            // Offline or mid-deploy: the fetch handler caches it next time.
          }
        })
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

/**
 * Vite fingerprints every built asset (index-a1b2c3d4.js), so a given URL's
 * content can never change - those are safe to serve from cache immediately
 * and forever. The HTML document is the opposite: its URL is stable and its
 * contents change on every deploy, because it's what names the current
 * bundle. Caching it first is what broke deploys.
 */
function isHashedAsset(url) {
  return /\/assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|jpg|svg)$/.test(url.pathname);
}

function isDocument(request, url) {
  return request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html");
}

/**
 * True when the server answered an asset request with an HTML page - which
 * always means "this file is gone and something rewrote the request", never
 * a real asset. Never cache one of these, and treat it as a signal that this
 * worker's whole cache is describing a build that no longer exists.
 */
function isHtmlResponse(response) {
  return (response.headers.get("content-type") || "").includes("text/html");
}

/**
 * Last resort: drop every cache and unregister, then reload the open pages.
 *
 * Only called when a fingerprinted asset comes back as HTML, i.e. the cached
 * document points at a build that is no longer deployed. Without this the
 * only cure is the user knowing to hard-refresh - which is not something a
 * normal visitor will ever do; they will just see a white page and leave.
 */
async function selfHeal() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) client.navigate(client.url);
  } catch {
    // Nothing further we can safely do from here.
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls - live location/weather/GIS/route data is never
  // served stale.
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;
  // Only this origin. Map tiles and third-party imagery have their own HTTP
  // caching and are far too large to hold here.
  if (url.origin !== self.location.origin) return;

  // The document: network first, cache only as an offline fallback. This is
  // the whole fix - a new deploy is picked up on the next load, every time.
  if (isDocument(event.request, url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && isHtmlResponse(response)) {
            const forCache = response.clone();
            const forParse = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then(async (cache) => {
                await cache.put("/", forCache);
                // A new deploy means new hashed files: pick them up now, while
                // online, rather than discovering they are missing offline.
                await cacheStartupFiles(cache, await forParse.text());
              })
            );
          }
          return response;
        })
        .catch(() => caches.match("/", MATCH).then((cached) => cached || Response.error()))
    );
    return;
  }

  // Fingerprinted assets: cache first, since the content behind one of these
  // URLs cannot change.
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(event.request, MATCH).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            // An HTML answer to a .js/.css request means this asset is gone
            // from the deployment. Do NOT cache it - that is what made the
            // failure permanent - and tear this worker down so the next load
            // comes fresh from the network.
            if (isHtmlResponse(response)) {
              event.waitUntil(selfHeal());
              return response;
            }
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else same-origin (manifest, icons): serve from cache for
  // speed, but refresh it in the background so it can't go stale forever.
  event.respondWith(
    caches.match(event.request, MATCH).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok && !isHtmlResponse(response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
