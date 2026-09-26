import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter } from "../_lib/cache.js";
import {
  resolveCountryWithOfficeholders,
  resolveStateWithOfficeholders,
  resolveCityWithOfficeholder,
  resolveDistrictWithOfficeholder,
  entityUrl,
} from "../_lib/wikidata.js";

/**
 * Official / Authority Intelligence.
 *
 * Given a resolved address (country/state/district/city, from
 * api/reverse-geocode.ts), returns the current officials for each
 * administrative level that can be reliably identified - sourced from
 * Wikidata (see api/_lib/wikidata.ts for why). This module NEVER invents a
 * name: every entry is either backed by a live, sourced Wikidata statement
 * ("verified") or explicitly says "Unable to verify" ("unavailable") -
 * there is no third state and no fallback to guessing. Officeholders
 * change rarely enough that a 6h cache is a reasonable trade against
 * hammering the public SPARQL endpoint on every search.
 */

const cache = new TtlCache<OfficialEntry[]>(6 * 60 * 60 * 1000);
const limiter = new RateLimiter(60_000, 20);

// The whole handler's budget. The browser aborts this request at 20s
// (REQUEST_TIMEOUT_MS, src/services/apiClient.ts), so everything here has to
// finish inside that with room for network and JSON parsing on top - see the
// long note in the handler for the bug this fixes.
const OFFICIALS_BUDGET_MS = 15_000;
// Ceiling for any single SPARQL query. Two stages at this ceiling still fit
// inside OFFICIALS_BUDGET_MS; a slow first stage shrinks the second rather
// than overrunning, because each stage asks for whatever budget is left.
const MAX_QUERY_MS = 7_000;
// Below this there isn't enough budget left for a Wikidata query to
// realistically return, so the remaining levels report that plainly instead
// of burning the rest of the request on a guaranteed timeout.
const MIN_USEFUL_QUERY_MS = 1_500;

export type OfficialLevel = "country" | "state" | "district" | "city";

export interface OfficialEntry {
  level: OfficialLevel;
  levelLabel: string;
  role: string;
  name: string | null;
  status: "verified" | "unavailable";
  since: string | null;
  sourceUrl: string | null;
  sourceLabel: string;
  note?: string;
}

interface RoleLabels {
  headOfState: string;
  headOfGovernment: string;
  /** Label to use when the same person holds both roles (e.g. a US-style presidency). */
  merged?: string;
}

// Title WORDS only - never a person's name, and titles essentially never
// change even when the officeholder does, so this is stable static
// reference data, not the kind of hardcoding the feature must avoid. Kept
// deliberately modest: countries not listed fall back to the generic
// President/Prime Minister pattern below, which is accurate for most of
// the world's republics; genuinely wrong cases (e.g. a monarchy shown as
// "President") are a labeling nit to extend later, never a wrong NAME.
const COUNTRY_ROLE_LABELS: Record<string, RoleLabels> = {
  US: { headOfState: "President", headOfGovernment: "President", merged: "President" },
  BR: { headOfState: "President", headOfGovernment: "President", merged: "President" },
  MX: { headOfState: "President", headOfGovernment: "President", merged: "President" },
  ID: { headOfState: "President", headOfGovernment: "President", merged: "President" },
  PH: { headOfState: "President", headOfGovernment: "President", merged: "President" },
  ZA: { headOfState: "President", headOfGovernment: "President", merged: "President" },
  NG: { headOfState: "President", headOfGovernment: "President", merged: "President" },
  TR: { headOfState: "President", headOfGovernment: "President", merged: "President" },
  IN: { headOfState: "President", headOfGovernment: "Prime Minister" },
  PK: { headOfState: "President", headOfGovernment: "Prime Minister" },
  BD: { headOfState: "President", headOfGovernment: "Prime Minister" },
  FR: { headOfState: "President", headOfGovernment: "Prime Minister" },
  RU: { headOfState: "President", headOfGovernment: "Prime Minister" },
  IT: { headOfState: "President", headOfGovernment: "Prime Minister" },
  DE: { headOfState: "President", headOfGovernment: "Chancellor" },
  AT: { headOfState: "President", headOfGovernment: "Chancellor" },
  CN: { headOfState: "President", headOfGovernment: "Premier" },
  GB: { headOfState: "Monarch", headOfGovernment: "Prime Minister" },
  CA: { headOfState: "Monarch", headOfGovernment: "Prime Minister" },
  AU: { headOfState: "Monarch", headOfGovernment: "Prime Minister" },
  NZ: { headOfState: "Monarch", headOfGovernment: "Prime Minister" },
  JP: { headOfState: "Emperor", headOfGovernment: "Prime Minister" },
};
const DEFAULT_COUNTRY_ROLE_LABELS: RoleLabels = { headOfState: "President", headOfGovernment: "Prime Minister" };

const STATE_ROLE_LABELS: Record<string, RoleLabels> = {
  US: { headOfState: "Governor", headOfGovernment: "Governor", merged: "Governor" },
  IN: { headOfState: "Governor", headOfGovernment: "Chief Minister" },
  PK: { headOfState: "Governor", headOfGovernment: "Chief Minister" },
  AU: { headOfState: "Governor", headOfGovernment: "Premier" },
  CA: { headOfState: "Lieutenant Governor", headOfGovernment: "Premier" },
};
const DEFAULT_STATE_ROLE_LABELS: RoleLabels = { headOfState: "Governor", headOfGovernment: "Head of Government" };

function districtRoleLabel(countryCode: string): string {
  return countryCode === "IN" ? "District Magistrate / Collector" : "District / County Authority";
}

function unavailable(level: OfficialLevel, levelLabel: string, role: string, note: string): OfficialEntry {
  return { level, levelLabel, role, name: null, status: "unavailable", since: null, sourceUrl: null, sourceLabel: "Wikidata", note };
}

function verified(level: OfficialLevel, levelLabel: string, role: string, name: string, since: string | null, qid: string): OfficialEntry {
  return { level, levelLabel, role, name, status: "verified", since, sourceUrl: entityUrl(qid), sourceLabel: "Wikidata" };
}

/** Builds 1-2 entries (merged into one when the same person holds both roles) from a resolved hos/hog pair. */
function buildEntries(
  level: OfficialLevel,
  levelLabel: string,
  labels: RoleLabels,
  hos: { name: string; since: string | null } | null,
  hog: { name: string; since: string | null } | null,
  qid: string
): OfficialEntry[] {
  if (hos && hog && hos.name === hog.name) {
    return [verified(level, levelLabel, labels.merged ?? labels.headOfState, hos.name, hos.since ?? hog.since, qid)];
  }
  const entries: OfficialEntry[] = [];
  entries.push(hos ? verified(level, levelLabel, labels.headOfState, hos.name, hos.since, qid) : unavailable(level, levelLabel, labels.headOfState, `No current ${labels.headOfState.toLowerCase()} statement found on Wikidata for ${levelLabel}.`));
  entries.push(hog ? verified(level, levelLabel, labels.headOfGovernment, hog.name, hog.since, qid) : unavailable(level, levelLabel, labels.headOfGovernment, `No current ${labels.headOfGovernment.toLowerCase()} statement found on Wikidata for ${levelLabel}.`));
  return entries;
}

const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
/** ISO 3166-2, e.g. IN-TG, US-CA, GB-ENG. */
const STATE_CODE_RE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
const MAX_NAME_CHARS = 100;

const handler: ApiHandler = async (req, res) => {
  /*
    These go into Wikidata SPARQL queries. Codes are checked against their
    ISO shapes and names are length-capped, so nothing arbitrary reaches the
    query even though sparqlEscape would already keep it inside its string.
  */
  const name = (key: string) => getQueryParam(req, key)?.trim().slice(0, MAX_NAME_CHARS) || undefined;
  const country = name("country");
  const countryCode = getQueryParam(req, "countryCode")?.trim().toUpperCase();
  const state = name("state");
  const rawStateCode = getQueryParam(req, "stateCode")?.trim().toUpperCase();
  const stateCode = rawStateCode && STATE_CODE_RE.test(rawStateCode) ? rawStateCode : undefined;
  const district = name("district");
  const city = name("city");

  if (!countryCode || !COUNTRY_CODE_RE.test(countryCode)) {
    return err(res, 400, "'countryCode' (ISO 3166-1 alpha-2, e.g. IN) is required to look up officials.");
  }

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many officials requests. Please slow down.", "RATE_LIMITED");

  const cacheKey = `${countryCode}|${stateCode ?? state ?? ""}|${district ?? ""}|${city ?? ""}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return ok(res, { officials: cached, source: "Wikidata", cached: true, fetchedAt: new Date().toISOString() });
  }

  const officials: OfficialEntry[] = [];
  const countryLabel = country || countryCode;
  const countryLabels = COUNTRY_ROLE_LABELS[countryCode] ?? DEFAULT_COUNTRY_ROLE_LABELS;

  // Reported bug: the dev log filled with repeating "[wikidata] SPARQL
  // request failed [AbortError]" and the panel came back empty. This handler
  // used to run its four SPARQL queries strictly one after another -
  // country, then state, then city, then district - at 12s each, up to 48s,
  // while the browser gives up on this request after 20s
  // (REQUEST_TIMEOUT_MS in src/services/apiClient.ts). On a slow Wikidata
  // day it therefore COULDN'T finish: the client aborted mid-chain and every
  // level was lost, including the ones that had already resolved.
  //
  // Two changes fix that. The independent queries now run together (country
  // resolves by ISO 3166-1 and state by ISO 3166-2 - neither needs the
  // other; city and district only need the QIDs those two produce, and are
  // independent of each other). And the whole handler now works to a budget
  // that fits inside the client's, spending what's left rather than a fixed
  // per-query timeout - so a slow first stage shortens the second stage
  // instead of blowing the deadline. Anything that doesn't make it reports
  // "Unable to verify" like every other unresolved level, which is the
  // honest answer and leaves the levels that DID resolve intact.
  const deadlineAt = Date.now() + OFFICIALS_BUDGET_MS;
  const remainingMs = () => deadlineAt - Date.now();
  const queryTimeout = () => Math.min(MAX_QUERY_MS, Math.max(0, remainingMs()));

  const stateLabels = STATE_ROLE_LABELS[countryCode] ?? DEFAULT_STATE_ROLE_LABELS;
  const stateLabelFallback = state || stateCode;

  // Stage 1: country + state, in parallel.
  const [countryResult, stateResult] = await Promise.all([
    resolveCountryWithOfficeholders(countryCode, queryTimeout()),
    stateCode ? resolveStateWithOfficeholders(stateCode, queryTimeout()) : Promise.resolve(null),
  ]);

  let countryQid: string | null = null;
  if (countryResult.place) {
    countryQid = countryResult.place.qid;
    officials.push(...buildEntries("country", countryResult.place.label, countryLabels, countryResult.headOfState, countryResult.headOfGovernment, countryQid));
  } else {
    officials.push(unavailable("country", countryLabel, "Head of State", `Could not resolve "${countryLabel}" to a Wikidata country entity.`));
  }

  // State level - only attempted when Nominatim gave us a precise ISO
  // 3166-2 code; a name-only fallback risks matching the wrong same-named
  // subdivision, so it's skipped rather than guessed.
  let stateQid: string | null = null;
  if (stateCode && stateResult) {
    if (stateResult.place) {
      stateQid = stateResult.place.qid;
      officials.push(...buildEntries("state", stateResult.place.label, stateLabels, stateResult.headOfState, stateResult.headOfGovernment, stateQid));
    } else if (stateLabelFallback) {
      officials.push(unavailable("state", stateLabelFallback, stateLabels.headOfGovernment, `Could not resolve "${stateLabelFallback}" (${stateCode}) to a Wikidata entity.`));
    }
  } else if (stateLabelFallback) {
    officials.push(
      unavailable(
        "state",
        stateLabelFallback,
        (STATE_ROLE_LABELS[countryCode] ?? DEFAULT_STATE_ROLE_LABELS).headOfGovernment,
        "No precise subdivision code available for this location, so the state/province couldn't be matched reliably enough to look up."
      )
    );
  }

  // Stage 2: city + district, in parallel. Both need the QIDs stage 1
  // produced (each lookup is scoped by country to avoid cross-country name
  // collisions), but not each other. If stage 1 ate the budget there's no
  // point starting a query that can only time out - those levels say so
  // plainly instead, and Retry gets a fresh budget.
  const outOfTime = remainingMs() < MIN_USEFUL_QUERY_MS;
  const [cityResult, districtResult] = await Promise.all([
    city && countryQid && !outOfTime ? resolveCityWithOfficeholder(city, countryQid, stateQid, queryTimeout()) : Promise.resolve(null),
    district && countryQid && !outOfTime ? resolveDistrictWithOfficeholder(district, countryQid, stateQid, queryTimeout()) : Promise.resolve(null),
  ]);

  if (city && countryQid) {
    if (outOfTime) {
      officials.push(unavailable("city", city, "Mayor", "The Wikidata lookup ran out of time before reaching the city level. Retry to try again."));
    } else if (cityResult?.place) {
      officials.push(
        cityResult.headOfGovernment
          ? verified("city", cityResult.place.label, "Mayor", cityResult.headOfGovernment.name, cityResult.headOfGovernment.since, cityResult.place.qid)
          : unavailable("city", cityResult.place.label, "Mayor", `No current mayor/head-of-government statement found on Wikidata for ${cityResult.place.label}.`)
      );
    } else {
      officials.push(unavailable("city", city, "Mayor", `Could not uniquely match "${city}" to a Wikidata place within ${countryLabel}${state ? `, ${state}` : ""}.`));
    }
  }

  // District level - expected to often come back unavailable even on a
  // healthy lookup (see resolveDistrictWithOfficeholder's doc comment).
  if (district && countryQid) {
    const roleLabel = districtRoleLabel(countryCode);
    if (outOfTime) {
      officials.push(unavailable("district", district, roleLabel, "The Wikidata lookup ran out of time before reaching the district level. Retry to try again."));
    } else if (districtResult?.place) {
      officials.push(
        districtResult.headOfGovernment
          ? verified("district", districtResult.place.label, roleLabel, districtResult.headOfGovernment.name, districtResult.headOfGovernment.since, districtResult.place.qid)
          : unavailable("district", districtResult.place.label, roleLabel, `${districtResult.place.label} was found on Wikidata, but it doesn't carry a current officeholder record.`)
      );
    } else {
      officials.push(unavailable("district", district, roleLabel, `Could not uniquely match "${district}" to a Wikidata place within ${countryLabel}${state ? `, ${state}` : ""}.`));
    }
  }

  cache.set(cacheKey, officials);
  ok(res, { officials, source: "Wikidata", cached: false, fetchedAt: new Date().toISOString() });
};

export default withMaintenanceGuard(withEdgeCache(21600)(handler));
