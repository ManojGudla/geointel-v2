import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getClientIp } from "../_lib/http.js";
import { RateLimiter, withTimeout } from "../_lib/cache.js";
import { getSupabaseClient } from "../_lib/supabase.js";

const limiter = new RateLimiter(60_000, 10);
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

const VALID_CATEGORIES = ["general", "bug", "data-accuracy", "feature-request", "praise"];

const handler: ApiHandler = async (req, res) => {
  if (req.method !== "POST") return err(res, 405, "Use POST.");

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many feedback submissions. Please slow down.", "RATE_LIMITED");

  const body = (req.body ?? {}) as FeedbackRequestBody;
  const rating = Number(body.rating);
  const deviceId = (body.deviceId || "").trim();
  const category = body.category && VALID_CATEGORIES.includes(body.category) ? body.category : "general";
  const message = (body.message || "").trim().slice(0, 2000);

  if (!deviceId) return err(res, 400, "A device id is required.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return err(res, 400, "'rating' must be an integer from 1 to 5.");

  const client = getSupabaseClient();
  if (!client) {
    return err(res, 503, "Feedback storage isn't configured yet. The server is missing its Supabase credentials.", "NOT_CONFIGURED");
  }

  // ip_address/user_agent are read server-side from the request, never
  // trusted from the request body — the client can't spoof who it says it
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
        page_context: body.pageContext ?? null,
        ip_address: ip,
        user_agent: (req.headers["user-agent"] as string | undefined) || null,
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
