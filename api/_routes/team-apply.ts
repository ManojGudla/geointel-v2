import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getClientIp } from "../_lib/http.js";
import { RateLimiter, withTimeout } from "../_lib/cache.js";
import { getSupabaseClient } from "../_lib/supabase.js";

const limiter = new RateLimiter(60_000, 5);
// See withTimeout in ./_lib/cache.ts: this insert used to have nothing
// bounding it, so a slow/unreachable Supabase project could hang the
// request indefinitely instead of failing visibly.
const SUPABASE_CALL_TIMEOUT_MS = 6_000;

interface TeamApplicationBody {
  name?: string;
  email?: string;
  interest?: string;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_INTERESTS = ["engineering", "design", "gis-data", "product", "other"];

/**
 * "Join Our Team" applications. Deliberately not a real accounts/HR system —
 * it's a lead-capture form, same honest pattern as api/feedback.ts: real
 * rows in a real table when Supabase is configured, a clear "not configured
 * yet" error otherwise, never a fabricated "application received" when
 * nothing was actually saved.
 */
const handler: ApiHandler = async (req, res) => {
  if (req.method !== "POST") return err(res, 405, "Use POST.");

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many applications submitted. Please slow down.", "RATE_LIMITED");

  const body = (req.body ?? {}) as TeamApplicationBody;
  const name = (body.name || "").trim().slice(0, 200);
  const email = (body.email || "").trim().slice(0, 320);
  const interest = body.interest && VALID_INTERESTS.includes(body.interest) ? body.interest : "other";
  const message = (body.message || "").trim().slice(0, 2000);

  if (!name) return err(res, 400, "Your name is required.");
  if (!email || !EMAIL_RE.test(email)) return err(res, 400, "A valid email address is required.");

  const client = getSupabaseClient();
  if (!client) {
    return err(res, 503, "Team applications aren't configured yet — the server is missing its Supabase credentials.", "NOT_CONFIGURED");
  }

  // Same reasoning as api/feedback.ts: server-observed IP/user agent and a
  // database-generated created_at, never anything the client could spoof —
  // see supabase/migrations/0003_submission_metadata.sql.
  try {
    const { error } = await withTimeout(
      client.from("team_applications").insert({
        name,
        email,
        interest,
        message: message || null,
        ip_address: ip,
        user_agent: (req.headers["user-agent"] as string | undefined) || null,
      }),
      SUPABASE_CALL_TIMEOUT_MS,
      "team_applications insert"
    );

    if (error) {
      console.error("[api/team-apply] insert failed", error.message);
      return err(res, 502, "Couldn't save your application right now. Please try again.", "PROVIDER_UNAVAILABLE");
    }

    ok(res, { saved: true });
  } catch (error) {
    console.error("[api/team-apply] insert failed/timed out", error instanceof Error ? error.message : error);
    return err(res, 502, "Couldn't save your application right now. Please try again.", "PROVIDER_UNAVAILABLE");
  }
};

export default withMaintenanceGuard(handler);
