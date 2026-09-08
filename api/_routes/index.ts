import type { ApiHandler } from "../_lib/http.js";

import buildings from "./buildings.js";
import feedback from "./feedback.js";
import geocode from "./geocode.js";
import gis from "./gis.js";
import health from "./health.js";
import imagery from "./imagery.js";
import live from "./live.js";
import nearby from "./nearby.js";
import news from "./news.js";
import officials from "./officials.js";
import poiEvidence from "./poi-evidence.js";
import population from "./population.js";
import reverseGeocode from "./reverse-geocode.js";
import routeHandler from "./route.js";
import status from "./status.js";
import teamApply from "./team-apply.js";
import weather from "./weather.js";
import aiIntent from "./ai-intent.js";
import aiAgent from "./ai/agent.js";
import aiCopilot from "./ai/copilot.js";
import adminMaintenance from "./admin/maintenance.js";
import adminSubmissions from "./admin/submissions.js";

/**
 * The single source of truth for what /api/* serves, keyed by the path after
 * "/api/".
 *
 * Why this exists rather than a file per serverless function: Vercel counts
 * every file under api/ as its own serverless function, and the Hobby plan
 * caps a deployment at 12. This project has 17 endpoints, so `vercel --prod`
 * failed outright with "No more than 12 Serverless Functions can be added to
 * a Deployment on the Hobby plan" — which is also why the live site served a
 * frontend with no working API at all. Moving the handlers under api/_routes/
 * (a leading underscore tells Vercel these are support files, not entry
 * points) and dispatching them from one catch-all — api/[...path].ts — makes
 * the whole API a single function, so the endpoint count can grow freely
 * from here.
 *
 * Both the production catch-all AND the local dev server
 * (plugins/vite-plugin-api.ts) resolve routes through this same table, so a
 * handler that isn't registered here 404s identically in dev and in
 * production — the mismatch can't hide until deploy time.
 */
export const ROUTES: Record<string, ApiHandler> = {
  buildings,
  feedback,
  geocode,
  gis,
  health,
  imagery,
  live,
  nearby,
  news,
  officials,
  "poi-evidence": poiEvidence,
  population,
  "reverse-geocode": reverseGeocode,
  route: routeHandler,
  status,
  "team-apply": teamApply,
  weather,
  "ai-intent": aiIntent,
  "ai/agent": aiAgent,
  "ai/copilot": aiCopilot,
  "admin/maintenance": adminMaintenance,
  "admin/submissions": adminSubmissions,
};

/** Normalizes a request URL into a ROUTES key: "/api/ai/copilot?x=1" -> "ai/copilot". */
export function routeKeyFromUrl(url: string | undefined): string {
  const pathname = new URL(url ?? "/", "http://localhost").pathname;
  return pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
}
