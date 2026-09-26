import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import App from "./App";
import "@/styles/reset.css";
import "@/styles/tokens.css";
import "./App.css";
import { shouldRetryQuery } from "@/services/apiClient";

// Sentry will be initialized AFTER consent is granted (see ConsentBanner.tsx)
// This keeps it privacy-first: nothing loads until user opts in.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Real-world reported issue: free public Overpass mirrors (GIS
      // evidence, Nearby, POI click-to-inspect, GIS layers all share
      // api/_lib/overpass.ts's 6-mirror race) go through rough patches
      // where several mirrors 502/504 or time out at once - the query
      // fails, and with only 1 retry the user had to keep clicking Retry
      // by hand until a healthy mirror combination came up, sometimes for
      // minutes. Each attempt re-races all 6 mirrors fresh, and which ones
      // are healthy shifts moment to moment, so more automatic attempts
      // meaningfully improve the odds of resolving on their own. Paired
      // with the shorter per-mirror timeout in overpass.ts, going from 1
      // to 2 retries roughly triples the independent attempts without
      // materially raising the worst-case wall-clock wait.
      // Two retries for transient failures; none for answers that are final
      // (rate limited, not configured). See shouldRetryQuery.
      retry: shouldRetryQuery,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});
const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found.");

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary label="maNOWj GeoIntel" variant="page">
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);

// Registers the installability service worker (public/sw.js) so the app can
// be "Added to Home Screen." Only in production builds - in dev it would
// just cache stale Vite-served assets and confuse hot reload.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("[pwa] service worker registration failed", error);
    });

    /*
      Hand the worker the app files this page already loaded.

      Files requested before the worker takes control never pass through it,
      so on a first visit, or the first visit after an update, the map's own
      code (MapView, MapLibre) was never cached, and offline the app started
      without a map. Sent once when the worker is ready and again a little
      later for anything loaded since. The worker fetches only what it lacks,
      normally straight from the browser's cache.
    */
    const sendLoadedFiles = (registration: ServiceWorkerRegistration) => {
      const urls = performance
        .getEntriesByType("resource")
        .map((entry) => new URL(entry.name))
        .filter((url) => url.origin === location.origin && url.pathname.startsWith("/assets/"))
        .map((url) => url.pathname);
      registration.active?.postMessage({ type: "cache-loaded-files", urls });
    };
    void navigator.serviceWorker.ready.then((registration) => {
      sendLoadedFiles(registration);
      setTimeout(() => sendLoadedFiles(registration), 10_000);
    });
  });
}
