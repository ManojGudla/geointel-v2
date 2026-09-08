/**
 * Recovery guard — the last line of defence against a blank page.
 *
 * If the main bundle has not mounted anything a few seconds after load, this
 * tears down every service worker and cache and reloads ONCE. It exists
 * because of a real outage: a stale cached index.html asked for an asset hash
 * that was no longer deployed, the SPA rewrite answered with index.html
 * instead of a 404, the browser refused it as a module, and the page rendered
 * completely blank. Nothing inside the app could report that, because the app
 * never started.
 *
 * WHY THIS IS A SEPARATE FILE, and not an inline <script> in index.html:
 *
 * It was inline, and it never ran in production. The production
 * Content-Security-Policy is `script-src 'self'` — no 'unsafe-inline' — so
 * the browser blocked it on every single page load:
 *
 *   Executing inline script violates the following Content Security Policy
 *   directive: "script-src 'self'". ... The action has been blocked.
 *
 * It was invisible in development because the dev server's CSP allows
 * 'unsafe-inline' (Vite needs it for HMR), so the guard worked locally and
 * was dead on the live site — the worst kind of bug in a safety net. The fix
 * is to serve it from this origin like any other script, which 'self' allows.
 *
 * Two rules keep it working:
 *   1. Nothing in here may be an inline event handler (onclick="...") either —
 *      those are blocked by exactly the same directive. Use addEventListener.
 *   2. The filename must stay unfingerprinted and must stay excluded from the
 *      SPA rewrite in vercel.json, so this file can never itself become the
 *      missing asset it exists to recover from.
 *
 * tests/unit/cspInline.test.ts holds both rules.
 */
(function () {
  var ATTEMPT_KEY = "manowj.recovery.attempted";
  var WAIT_MS = 6000;

  /**
   * "Blank" means the app never mounted — which is NOT the same as an empty
   * #root any more.
   *
   * index.html now ships a static fallback inside #root so the page has real
   * content for crawlers and for anyone without JavaScript. That fallback made
   * the old check (children.length === 0) permanently false, which would have
   * silently disabled this entire guard. React replaces the container's
   * children on mount, so the fallback still being the only thing there is
   * exactly the signal that the app failed to start.
   */
  function stillBlank() {
    var root = document.getElementById("root");
    if (!root) return true;
    if (root.children.length === 0) return true;
    return root.children.length === 1 && root.firstElementChild.id === "prerender";
  }

  /**
   * Second failure: stop retrying and say so in plain words. A silent retry
   * loop is worse than an honest dead end — the visitor at least knows to
   * come back, and the message says it is probably not their device.
   */
  function explain() {
    var root = document.getElementById("root");
    if (!root) return;

    root.innerHTML =
      '<div style="font:14px/1.6 system-ui,sans-serif;max-width:420px;margin:16vh auto;padding:24px;text-align:center;color:#101828">' +
      '<p style="font-size:17px;font-weight:700;margin:0 0 8px">maNOWj GeoIntel could not start</p>' +
      '<p style="margin:0 0 16px;color:#55607a">The app files could not be loaded. This is usually a network or cache problem rather than a fault on your device.</p>' +
      '<button type="button" id="manowj-retry" style="min-height:42px;padding:0 20px;border:0;border-radius:10px;background:#1d3f8f;color:#fff;font-weight:700;cursor:pointer">Try again</button>' +
      "</div>";

    // addEventListener, NOT an onclick attribute — see the note above.
    var retry = document.getElementById("manowj-retry");
    if (retry) {
      retry.addEventListener("click", function () {
        location.reload();
      });
    }
  }

  async function recover() {
    try {
      if (window.caches) {
        var keys = await caches.keys();
        await Promise.all(
          keys.map(function (k) {
            return caches.delete(k);
          })
        );
      }
      if (navigator.serviceWorker) {
        var regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs.map(function (r) {
            return r.unregister();
          })
        );
      }
    } catch (e) {
      /* cleared what we could */
    }
    location.reload();
  }

  window.addEventListener("load", function () {
    window.setTimeout(function () {
      if (!stillBlank()) {
        // Started fine — clear the flag so a genuine failure much later still
        // gets its own single recovery attempt.
        try {
          sessionStorage.removeItem(ATTEMPT_KEY);
        } catch (e) {}
        return;
      }

      var tried = false;
      try {
        tried = sessionStorage.getItem(ATTEMPT_KEY) === "1";
      } catch (e) {}

      // The sessionStorage flag makes a reload loop impossible: one attempt,
      // then an explanation.
      if (tried) {
        explain();
        return;
      }
      try {
        sessionStorage.setItem(ATTEMPT_KEY, "1");
      } catch (e) {}
      recover();
    }, WAIT_MS);
  });
})();
