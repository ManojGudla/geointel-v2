import type { ApiHandler } from "../../_lib/http.js";
import { ok, err, getClientIp, noStore } from "../../_lib/http.js";
import { checkDurableLimit } from "../../_lib/rateLimit.js";
import { getSupabaseClient } from "../../_lib/supabase.js";
import { isAdminConfigured, isAdminRequest } from "../../_lib/adminAuth.js";
import { getMaintenanceState, invalidateMaintenanceCache, type MaintenanceType } from "../../_lib/maintenance.js";
import { withTimeout } from "../../_lib/cache.js";

// Same class of bug as api/_lib/maintenance.ts's own app_settings read (see
// withTimeout in api/_lib/cache.ts): every direct Supabase call below used
// to have nothing bounding it, so a slow/unreachable Supabase project could
// hang this endpoint indefinitely instead of failing visibly.
const SUPABASE_CALL_TIMEOUT_MS = 6_000;

// Why this endpoint is rate limited harder than the rest: a wrong guess here
// is not just wasted quota, it is a free oracle. The GET path echoes back
// `adminKeyValid: true/false` for whatever x-geointel-admin-key header is
// sent, and the POST path accepts the same header to flip maintenance mode on
// or off for every visitor. The constant-time comparison in adminAuth.ts stops
// a timing side channel; it does nothing about raw volume.
//
// The limiter used to be an in-process RateLimiter, which on serverless meant
// it reset on every cold start and counted separately on every concurrent
// instance - so it did not bound guessing at all. It now counts in Postgres;
// see api/_lib/rateLimit.ts. A real admin is nowhere near 20 requests a
// minute, so the limit is invisible in normal use.

interface MaintenanceUpdateBody {
  action?: "enable" | "disable" | "update";
  type?: MaintenanceType;
  title?: string;
  message?: string;
  estimatedEnd?: string;
  supportInfo?: string;
  showStatus?: boolean;
  showCountdown?: boolean;
  /** The admin's own Settings → Display name, if they've set one - never a fabricated identity, just whatever they typed for themselves. */
  adminLabel?: string;
}

const VALID_ACTIONS = ["enable", "disable", "update"];

/**
 * The one endpoint the whole maintenance-mode feature turns on:
 *  - GET is public (no admin key needed) - every visitor's browser polls
 *    this to know whether to show the maintenance page. Sending a valid
 *    admin key additionally unlocks the recent audit log, and reports
 *    whether that key is valid (so the admin dashboard can verify a
 *    passphrase without a separate endpoint).
 *  - POST requires a valid x-geointel-admin-key header and enables/disables/
 *    updates the single app_settings row, logging the action for real.
 */
const handler: ApiHandler = async (req, res) => {
  // Visitor PII and the audit log. Never cacheable, and the body varies
  // by the admin key header, so say both.
  noStore(res);

  /**
   * Durable, not in-memory. The GET branch below answers "is this admin key
   * correct?" for anyone who asks, so this counter is the only thing bounding
   * how fast the key can be guessed - and the in-memory version reset on every
   * cold start and counted separately on every concurrent instance.
   */
  const rate = await checkDurableLimit("admin", getClientIp(req), 60_000, 20);
  if (!rate.allowed) return err(res, 429, "Too many admin requests. Please slow down.", "RATE_LIMITED");

  if (req.method === "GET") {
    const state = await getMaintenanceState();
    const responseBody: { maintenance: typeof state; adminKeyValid?: boolean; auditLog?: unknown[] } = { maintenance: state };

    const keyProvided = typeof req.headers["x-geointel-admin-key"] === "string" && req.headers["x-geointel-admin-key"] !== "";
    if (keyProvided) {
      const valid = isAdminRequest(req);
      /**
       * A wrong key is now indistinguishable from no key.
       *
       * This branch used to return `adminKeyValid: false` to anyone who
       * asked, which turned guessing the admin passphrase into a loop with
       * instant feedback - an unauthenticated confirm oracle in front of the
       * only secret protecting every visitor's name, email, IP and message.
       * The per-IP limiter did not close it: it is defeated by a pool of
       * cloud addresses, and it silently degrades to a per-instance memory
       * counter whenever Supabase is slow, which is exactly when an attacker
       * would push hardest.
       *
       * So the flag is only ever sent when the key was CORRECT. A caller who
       * already holds the key learns nothing new; a caller who does not gets
       * the same response as an anonymous visitor, and has no signal to
       * optimise against. Failures are still logged, so a burst is visible.
       */
      if (!valid) {
        console.warn("[admin] auth failure", { route: "maintenance:probe", ip: getClientIp(req), ua: req.headers["user-agent"] });
      }
      if (valid) {
        responseBody.adminKeyValid = true;
        const client = getSupabaseClient();
        if (client) {
          try {
            const { data } = await withTimeout(
              client.from("maintenance_audit_log").select("*").order("created_at", { ascending: false }).limit(20),
              SUPABASE_CALL_TIMEOUT_MS,
              "maintenance_audit_log read"
            );
            responseBody.auditLog = data ?? [];
          } catch (error) {
            // The admin key was already verified above - don't fail the
            // whole status check just because the audit log specifically
            // timed out; report an empty log rather than hanging.
            console.error("[api/admin/maintenance] audit log read failed/timed out", error instanceof Error ? error.message : error);
            responseBody.auditLog = [];
          }
        }
      }
    }

    return ok(res, responseBody);
  }

  if (req.method !== "POST") return err(res, 405, "Use GET or POST.");

  if (!isAdminConfigured()) {
    return err(res, 503, "Admin access isn't configured yet. Set GEOINTEL_ADMIN_KEY on the server.", "NOT_CONFIGURED");
  }
  if (!isAdminRequest(req)) {
    console.warn("[admin] auth failure", { route: "maintenance:write", ip: getClientIp(req), ua: req.headers["user-agent"] });
    return err(res, 401, "Invalid or missing admin key.", "UNAUTHORIZED");
  }

  const body = (req.body ?? {}) as MaintenanceUpdateBody;
  if (!body.action || !VALID_ACTIONS.includes(body.action)) {
    return err(res, 400, "'action' must be one of enable, disable, update.");
  }

  const client = getSupabaseClient();
  if (!client) {
    return err(res, 503, "Maintenance settings storage isn't configured yet. The server is missing its Supabase credentials.", "NOT_CONFIGURED");
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };

  if (body.action === "enable") {
    patch.maintenance_mode = true;
    patch.maintenance_started_at = now;
  } else if (body.action === "disable") {
    patch.maintenance_mode = false;
    patch.maintenance_started_at = null;
  }

  if (body.type === "scheduled" || body.type === "emergency") patch.maintenance_type = body.type;
  if (typeof body.title === "string") patch.maintenance_title = body.title.trim().slice(0, 200) || null;
  if (typeof body.message === "string") patch.maintenance_message = body.message.trim().slice(0, 2000) || null;
  if (typeof body.estimatedEnd === "string") patch.maintenance_estimated_end = body.estimatedEnd.trim().slice(0, 200) || null;
  if (typeof body.supportInfo === "string") patch.maintenance_support_info = body.supportInfo.trim().slice(0, 500) || null;
  if (typeof body.showStatus === "boolean") patch.maintenance_show_status = body.showStatus;
  if (typeof body.showCountdown === "boolean") patch.maintenance_show_countdown = body.showCountdown;

  let updateError: { message: string } | null;
  try {
    const { error } = await withTimeout(client.from("app_settings").update(patch).eq("id", 1), SUPABASE_CALL_TIMEOUT_MS, "app_settings update");
    updateError = error;
  } catch (error) {
    updateError = { message: error instanceof Error ? error.message : "app_settings update timed out" };
  }
  if (updateError) {
    console.error("[api/admin/maintenance] update failed", updateError.message);
    return err(res, 502, "Couldn't save maintenance settings right now.", "PROVIDER_UNAVAILABLE");
  }

  invalidateMaintenanceCache();

  const adminLabel = (typeof body.adminLabel === "string" ? body.adminLabel.trim().slice(0, 100) : "") || "Admin";
  const logAction = body.action === "enable" ? "enabled" : body.action === "disable" ? "disabled" : "settings_updated";
  try {
    const { error: logError } = await withTimeout(
      client.from("maintenance_audit_log").insert({
        action: logAction,
        maintenance_type: (patch.maintenance_type as string | undefined) ?? null,
        admin_label: adminLabel,
      }),
      SUPABASE_CALL_TIMEOUT_MS,
      "maintenance_audit_log insert"
    );
    // Don't fail the whole request over a logging hiccup - the setting
    // change itself already succeeded and is what the admin asked for.
    if (logError) console.error("[api/admin/maintenance] audit log insert failed", logError.message);
  } catch (error) {
    console.error("[api/admin/maintenance] audit log insert failed/timed out", error instanceof Error ? error.message : error);
  }

  const state = await getMaintenanceState();
  ok(res, { maintenance: state });
};

export default handler;
