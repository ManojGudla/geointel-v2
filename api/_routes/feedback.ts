import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getClientIp } from "../_lib/http.js";
import { withTimeout } from "../_lib/cache.js";
import { checkDurableLimit } from "../_lib/rateLimit.js";
import { getSupabaseClient } from "../_lib/supabase.js";

// See withTimeout in ./_lib/cache.ts: this insert used to have nothing
// bounding it, so a slow/unreachable Supabase project could hang the
// request indefinitely instead of failing visibly.
const SUPABASE_CALL_TIMEOUT_MS = 6_000;

interface FeedbackRequestBody {
  deviceId?: string;
  rating?: number;
  category?: string;
  message?: string;
  pageContext?: Record<string, unknown>;
}

/**
 * pageContext is free-form JSON from the browser, stored straight into a
 * jsonb column. Only a plain object under a few kilobytes is kept; anything
 * else is dropped rather than letting one request store megabytes.
 */
const MAX_PAGE_CONTEXT_CHARS = 4_000;
function boundedContext(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    return JSON.stringify(value).length <= MAX_PAGE_CONTEXT_CHARS ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const VALID_CATEGORIES = ["general", "bug", "data-accuracy", "feature-request", "praise"];

const handler: ApiHandler = async (req, res) => {
  if (req.method !== "POST") return err(res, 405, "Use POST.");

  const ip = getClientIp(req);
  /*
    Counted in the database, not in this function's memory. Every serverless
    instance kept its own in-memory count, so ten a minute per instance became
    ten a minute times however many instances a burst of traffic warmed up,
    on the one route that writes to storage. Falls back to in-memory by
    itself if the database is unreachable. See api/_lib/rateLimit.ts.
  */
  const rate = await checkDurableLimit("feedback", ip, 60_000, 10);
  if (!rate.allowed) return err(res, 429, "Too many feedback submissions. Please slow down.", "RATE_LIMITED");

  const body = (req.body ?? {}) as FeedbackRequestBody;
  const rating = Number(body.rating);
  // Capped: this is stored as-is, and nothing else about it is checked.
  const deviceId = String(body.deviceId || "").trim().slice(0, 100);
  const category = body.category && VALID_CATEGORIES.includes(body.category) ? body.category : "general";
  const message = (body.message || "").trim().slice(0, 2000);

  if (!deviceId) return err(res, 400, "A device id is required.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return err(res, 400, "'rating' must be an integer from 1 to 5.");

  const client = getSupabaseClient();
  if (!client) {
    return err(res, 503, "Feedback storage isn't configured yet. The server is missing its Supabase credentials.", "NOT_CONFIGURED");
  }

  // ip_address/user_agent are read server-side from the request, never
  // trusted from the request body - the client can't spoof who it says it
  // is here, and created_at (set by the database, not sent by the client)
  // is the exact, unspoofable submission time. See
  // supabase/migrations/0003_submission_metadata.sql for why this is safe
  // to store: RLS + service-role-only access means it never reaches another
  // visitor's browser.
  try {
    const { error } = await withTimeout(
      client.from("feedback").insert({
        device_id: deviceId,
        rating,
        category,
        message: message || null,
        page_context: boundedContext(body.pageContext),
        ip_address: ip,
        user_agent: String(req.headers["user-agent"] ?? "").slice(0, 400) || null,
      }),
      SUPABASE_CALL_TIMEOUT_MS,
      "feedback insert"
    );

    if (error) {
      console.error("[api/feedback] insert failed", error.message);
      return err(res, 502, "Couldn't save your feedback right now. Please try again.", "PROVIDER_UNAVAILABLE");
    }

    ok(res, { saved: true });
  } catch (error) {
    console.error("[api/feedback] insert failed/timed out", error instanceof Error ? error.message : error);
    return err(res, 502, "Couldn't save your feedback right now. Please try again.", "PROVIDER_UNAVAILABLE");
  }
};

export default withMaintenanceGuard(handler);
