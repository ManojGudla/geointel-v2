import { getSupabaseClient } from "./supabase.js";
import { TtlCache, withTimeout } from "./cache.js";
import { err } from "./http.js";
import type { ApiHandler, ApiRequest, ApiResponse } from "./http.js";
import { isAdminRequest } from "./adminAuth.js";

export type MaintenanceType = "scheduled" | "emergency";

export interface MaintenanceState {
  enabled: boolean;
  type: MaintenanceType;
  title: string;
  message: string;
  estimatedEnd: string | null;
  supportInfo: string | null;
  showStatus: boolean;
  showCountdown: boolean;
  startedAt: string | null;
  updatedAt: string | null;
}

const DEFAULT_STATE: MaintenanceState = {
  enabled: false,
  type: "scheduled",
  title: "Scheduled Maintenance",
  message: "maNOWj GeoIntel is temporarily unavailable while we perform system maintenance and improvements. We'll be back shortly.",
  estimatedEnd: null,
  supportInfo: null,
  showStatus: true,
  showCountdown: false,
  startedAt: null,
  updatedAt: null,
};

const CACHE_KEY = "state";
// Short TTL, not "no cache": every request through withMaintenanceGuard
// would otherwise hit Supabase, and this is the one setting that genuinely
// needs to propagate fast without a rebuild/restart. 5s keeps that real
// (an admin's toggle reaches every visitor within a few seconds) while still
// cutting the vast majority of duplicate reads.
const cache = new TtlCache<MaintenanceState>(5_000);

// This check runs on nearly every request in the app (withMaintenanceGuard
// wraps almost every handler below), so it needs its own tight, independent
// bound rather than inheriting whatever budget the handler it's guarding
// happens to have - see withTimeout in cache.ts for why this exists at all:
// a Supabase read here previously had no timeout whatsoever, which is what
// actually caused "every feature hangs for 5+ minutes."
const SUPABASE_CHECK_TIMEOUT_MS = 4_000;

interface AppSettingsRow {
  maintenance_mode: boolean | null;
  maintenance_type: string | null;
  maintenance_title: string | null;
  maintenance_message: string | null;
  maintenance_estimated_end: string | null;
  maintenance_support_info: string | null;
  maintenance_show_status: boolean | null;
  maintenance_show_countdown: boolean | null;
  maintenance_started_at: string | null;
  updated_at: string | null;
}

/**
 * Reads the single app_settings row (RLS-protected, service-role only).
 * Falls back to DEFAULT_STATE - i.e. "not in maintenance" - whenever
 * Supabase isn't configured or the row is missing, so a misconfigured or
 * not-yet-migrated deployment can never accidentally lock everyone out. The
 * only real way into maintenance is an explicit admin POST that writes this
 * row (api/admin/maintenance.ts).
 */
export async function getMaintenanceState(): Promise<MaintenanceState> {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const client = getSupabaseClient();
  if (!client) return DEFAULT_STATE;

  try {
    const { data, error } = await withTimeout(
      client.from("app_settings").select("*").eq("id", 1).maybeSingle(),
      SUPABASE_CHECK_TIMEOUT_MS,
      "app_settings lookup"
    );
    if (error || !data) return DEFAULT_STATE;

    const row = data as AppSettingsRow;
    const state: MaintenanceState = {
      enabled: !!row.maintenance_mode,
      type: row.maintenance_type === "emergency" ? "emergency" : "scheduled",
      title: row.maintenance_title || DEFAULT_STATE.title,
      message: row.maintenance_message || DEFAULT_STATE.message,
      estimatedEnd: row.maintenance_estimated_end ?? null,
      supportInfo: row.maintenance_support_info ?? null,
      showStatus: row.maintenance_show_status ?? true,
      showCountdown: row.maintenance_show_countdown ?? false,
      startedAt: row.maintenance_started_at ?? null,
      updatedAt: row.updated_at ?? null,
    };

    cache.set(CACHE_KEY, state);
    return state;
  } catch (error) {
    // Same fallback as "not configured" or "row missing" above: a slow or
    // unreachable Supabase project must never turn into "hold every visitor
    // hostage until it responds." This is the timeout case (see
    // SUPABASE_CHECK_TIMEOUT_MS / withTimeout in cache.ts) as well as any
    // other unexpected throw - either way, "not in maintenance" is the safe
    // default, same as the rest of this function.
    console.error("[maintenance] getMaintenanceState degraded", error instanceof Error ? error.message : error);
    return DEFAULT_STATE;
  }
}

/** Called after every admin write so the next read reflects it immediately, instead of waiting out the 5s TTL. */
export function invalidateMaintenanceCache() {
  cache.delete(CACHE_KEY);
}

/**
 * Wraps a normal api/*.ts handler so it refuses to run while maintenance
 * mode is on - real backend enforcement, not a frontend-only check a direct
 * API call could bypass. A request carrying a valid admin key always passes
 * through unaffected, mirroring "Administrators MUST still be able to
 * access" from the spec at the API layer, not just the /admin page.
 */
export function withMaintenanceGuard(handler: ApiHandler): ApiHandler {
  return async (req: ApiRequest, res: ApiResponse) => {
    if (isAdminRequest(req)) return handler(req, res);

    const state = await getMaintenanceState();
    if (state.enabled) {
      return err(res, 503, state.message || DEFAULT_STATE.message, "MAINTENANCE");
    }

    return handler(req, res);
  };
}
