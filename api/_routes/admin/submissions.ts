import type { ApiHandler } from "../../_lib/http.js";
import { ok, err, getClientIp, noStore } from "../../_lib/http.js";
import { checkDurableLimit } from "../../_lib/rateLimit.js";
import { getSupabaseClient } from "../../_lib/supabase.js";
import { isAdminConfigured, isAdminRequest } from "../../_lib/adminAuth.js";
import { withTimeout } from "../../_lib/cache.js";

// See withTimeout in api/_lib/cache.ts: this read used to have nothing
// bounding it, so a slow/unreachable Supabase project could hang this
// endpoint indefinitely instead of failing visibly.
const SUPABASE_CALL_TIMEOUT_MS = 6_000;

const LIMIT = 50;

// Same gap as api/admin/maintenance.ts, same fix: this endpoint accepts the
// same shared admin key and, unlike every other endpoint here, had no rate
// limiting — unlimited attempts to guess GEOINTEL_ADMIN_KEY, and a
// successful guess reads real visitor PII (feedback + team application
// submissions, including recorded IP address and user agent).

/**
 * Admin-only read of what visitors have actually submitted — Feedback and
 * Join Our Team applications — including the exact server-recorded
 * timestamp, IP address and user agent (api/feedback.ts, api/team-apply.ts;
 * see supabase/migrations/0003_submission_metadata.sql for why storing
 * those is safe: RLS + service-role-only access, same as here). Same admin
 * key as maintenance mode (api/_lib/adminAuth.ts) — this project has no
 * per-feature permission system, just the one shared admin gate.
 */
const handler: ApiHandler = async (req, res) => {
  // Visitor PII and the audit log. Never cacheable, and the body varies
  // by the admin key header, so say both.
  noStore(res);

  if (req.method !== "GET") return err(res, 405, "Use GET.");

  // Shares the "admin" scope with the maintenance route, so guessing cannot be
  // spread across the two endpoints to double the budget.
  const rate = await checkDurableLimit("admin", getClientIp(req), 60_000, 20);
  if (!rate.allowed) return err(res, 429, "Too many admin requests. Please slow down.", "RATE_LIMITED");

  if (!isAdminConfigured()) {
    return err(res, 503, "Admin access isn't configured yet — set GEOINTEL_ADMIN_KEY on the server.", "NOT_CONFIGURED");
  }
  if (!isAdminRequest(req)) {
    // Logged, because otherwise a wrong admin key leaves no record anywhere.
    // Someone guessing at this endpoint all night would produce nothing you
    // could find the next morning — the platform access log shows a 401 but
    // cannot tell a bad admin key from any other one.
    console.warn("[admin] auth failure", { route: "submissions", ip: getClientIp(req), ua: req.headers["user-agent"] });
    return err(res, 401, "Invalid or missing admin key.", "UNAUTHORIZED");
  }

  const client = getSupabaseClient();
  if (!client) {
    return err(res, 503, "Storage isn't configured yet — the server is missing its Supabase credentials.", "NOT_CONFIGURED");
  }

  try {
    const [feedbackResult, teamResult] = await withTimeout(
      Promise.all([
        client.from("feedback").select("*").order("created_at", { ascending: false }).limit(LIMIT),
        client.from("team_applications").select("*").order("created_at", { ascending: false }).limit(LIMIT),
      ]),
      SUPABASE_CALL_TIMEOUT_MS,
      "submissions read"
    );

    if (feedbackResult.error || teamResult.error) {
      console.error("[api/admin/submissions]", feedbackResult.error?.message, teamResult.error?.message);
      return err(res, 502, "Couldn't load submissions right now.", "PROVIDER_UNAVAILABLE");
    }

    ok(res, {
      feedback: feedbackResult.data ?? [],
      teamApplications: teamResult.data ?? [],
    });
  } catch (error) {
    console.error("[api/admin/submissions] read failed/timed out", error instanceof Error ? error.message : error);
    return err(res, 502, "Couldn't load submissions right now.", "PROVIDER_UNAVAILABLE");
  }
};

export default handler;
