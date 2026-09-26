import { fetchWithTimeout } from "./cache.js";

/**
 * Thin client over the Wikidata Query Service (SPARQL), the data backbone
 * for Official/Authority Intelligence (api/officials.ts).
 *
 * Why Wikidata: it's a free, no-API-key, structured, sourced database that
 * already models "head of state" (P35), "head of government" (P6), ISO
 * country/subdivision codes (P297/P300), and officeholder statements with
 * start/end-date qualifiers - exactly the shape needed to answer "who
 * currently holds office X" without ever needing to hardcode a person's
 * name. Every query below asks for the CURRENT holder only (no P582 "end
 * time" qualifier present on the statement) and returns nothing rather
 * than a guess when the data isn't there.
 *
 * This module never fabricates: every function returns null/empty on any
 * failure (network, timeout, malformed response, no match) rather than
 * throwing past the caller - api/officials.ts turns "no result" into an
 * explicit "Unable to verify" entry, never silence and never a guess.
 */

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
// Wikidata's usage policy asks for a descriptive User-Agent identifying the
// application and a contact means - same courtesy this project already
// extends to Nominatim (api/_lib/nominatim.ts) and Overpass.
const USER_AGENT = "maNOWj-GeoIntel/2.0 (location-intelligence app; contact: geointel app)";

export interface SparqlRow {
  [variable: string]: { type: string; value: string; "xml:lang"?: string } | undefined;
}

interface SparqlResponse {
  results?: { bindings?: SparqlRow[] };
}

/**
 * Runs one SPARQL query and returns its result rows, or an empty array on
 * any failure. Never throws - every caller in api/officials.ts treats "no
 * rows" as the normal "nothing found" case, so a network hiccup and a
 * genuinely empty result look the same to them (both correctly become
 * "Unable to verify," never an error state that could tempt a fallback
 * guess).
 */
export async function sparqlQuery(query: string, timeoutMs = 12_000): Promise<SparqlRow[]> {
  try {
    const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
    const response = await fetchWithTimeout(url, { headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT } }, timeoutMs);
    if (!response.ok) {
      console.error("[wikidata] SPARQL HTTP", response.status);
      return [];
    }
    const data = (await response.json()) as SparqlResponse;
    return data.results?.bindings ?? [];
  } catch (error) {
    console.error("[wikidata] SPARQL request failed", error);
    return [];
  }
}

/** Wikidata entity IRIs look like "http://www.wikidata.org/entity/Q30" - this pulls out just "Q30". */
export function qidFromUri(uri: string | undefined): string | null {
  if (!uri) return null;
  const id = uri.split("/").pop();
  return id && /^Q\d+$/.test(id) ? id : null;
}

export function entityUrl(qid: string): string {
  return `https://www.wikidata.org/wiki/${qid}`;
}

/**
 * Wikidata's own `SERVICE wikibase:label` has a documented fallback: when
 * an entity has no label in any requested/fallback language, it returns
 * the entity's own bare ID (e.g. "Q1058") as the label's value instead of
 * leaving the variable unbound. So a value shaped like a QID is Wikidata's
 * own "no real label was found" signal - not a real person's name or
 * place's name - and displaying it as one is a real, observed bug (a
 * Prime Minister card that literally read "Q1058"). This project's whole
 * premise is never showing a placeholder as if it were real data, so this
 * is filtered out once, at the root, rather than trusted at every call
 * site that reads a *Label binding.
 */
function realLabelOrNull(value: string | undefined): string | null {
  if (!value) return null;
  return /^Q\d+$/.test(value) ? null : value;
}

/** Escapes a string for safe interpolation inside a SPARQL string literal. */
export function sparqlEscape(value: string): string {
  // Backslash first, so the escapes added after it are not themselves doubled.
  // Newlines, returns and tabs are escaped rather than passed through: a raw
  // line break inside a SPARQL "..." literal is a syntax error, and any other
  // control character has no business in a place name at all.
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "");
}

/**
 * Resolves a place by an exact SPARQL WHERE clause (the caller supplies how
 * to find `?place` - by ISO code, by label match, etc.) and, in the SAME
 * query, pulls the CURRENT holder of both P35 (head of state) and P6 (head
 * of government) if present. Combining resolution and lookup in one round
 * trip keeps this fast; `FILTER NOT EXISTS { ... pq:P582 ... }` is what
 * restricts each to the holder with no recorded end date - i.e. still in
 * office - rather than every past holder ever recorded.
 */
async function resolveWithOfficeholders(
  placeWhereClause: string,
  timeoutMs?: number
): Promise<{
  place: { qid: string; label: string } | null;
  headOfState: { name: string; since: string | null } | null;
  headOfGovernment: { name: string; since: string | null } | null;
}> {
  const query = `
    SELECT ?place ?placeLabel ?hos ?hosLabel ?hosStart ?hog ?hogLabel ?hogStart WHERE {
      ${placeWhereClause}
      OPTIONAL {
        ?place p:P35 ?hosStmt .
        ?hosStmt ps:P35 ?hos .
        FILTER NOT EXISTS { ?hosStmt pq:P582 ?hosEnd }
        OPTIONAL { ?hosStmt pq:P580 ?hosStart }
      }
      OPTIONAL {
        ?place p:P6 ?hogStmt .
        ?hogStmt ps:P6 ?hog .
        FILTER NOT EXISTS { ?hogStmt pq:P582 ?hogEnd }
        OPTIONAL { ?hogStmt pq:P580 ?hogStart }
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
    }
  `;

  const rows = await sparqlQuery(query, timeoutMs);
  if (rows.length === 0) return { place: null, headOfState: null, headOfGovernment: null };

  const placeQid = qidFromUri(rows[0]!.place?.value);
  const placeLabel = realLabelOrNull(rows[0]!.placeLabel?.value);
  if (!placeQid || !placeLabel) return { place: null, headOfState: null, headOfGovernment: null };

  // A place can (rarely) have more than one statement lacking an end date -
  // a data-quality gap upstream, not something to crash on. Picking the one
  // with the latest start date is the most defensible single answer; still
  // never fabricated, since every candidate here IS a real sourced
  // statement on the item.
  const pickLatest = (predKey: "hos" | "hog") => {
    const candidates = rows
      .filter((r) => r[predKey]?.value)
      .map((r) => ({ name: realLabelOrNull(r[`${predKey}Label`]?.value), since: r[`${predKey}Start`]?.value ?? null }))
      .filter((c): c is { name: string; since: string | null } => !!c.name);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => (b.since ?? "").localeCompare(a.since ?? ""));
    return candidates[0]!;
  };

  return {
    place: { qid: placeQid, label: placeLabel },
    headOfState: pickLatest("hos"),
    headOfGovernment: pickLatest("hog"),
  };
}

/**
 * Country by ISO 3166-1 alpha-2 code (P297), e.g. "US", "IN".
 *
 * `timeoutMs` lets the caller spend its own remaining budget rather than
 * this module's default - api/officials.ts runs several of these against a
 * deadline that has to fit inside the browser's 20s request timeout. See
 * the note at the top of that handler.
 */
export function resolveCountryWithOfficeholders(iso2: string, timeoutMs?: number) {
  return resolveWithOfficeholders(`?place wdt:P297 "${sparqlEscape(iso2.toUpperCase())}" .`, timeoutMs);
}

/** First-level subdivision by ISO 3166-2 code (P300), e.g. "US-CA", "IN-TG". Resolves on its own code, independently of the country lookup. */
export function resolveStateWithOfficeholders(iso3166_2: string, timeoutMs?: number) {
  return resolveWithOfficeholders(`?place wdt:P300 "${sparqlEscape(iso3166_2.toUpperCase())}" .`, timeoutMs);
}

/**
 * City/settlement by exact (case-insensitive) English label, scoped to the
 * resolved country and optionally the resolved state - the two-hop P131
 * check (?place directly in the state, OR ?place in something that's in
 * the state) catches both "city is a direct child of the state" and
 * "city is inside a district that's inside the state" without a slow
 * transitive P131* walk over all of Wikidata. If more than one distinct
 * place matches even with these constraints, this returns null rather than
 * guessing which one - ambiguous same-named places are common enough
 * (Springfield, Vijayawada-adjacent towns, etc.) that a wrong guess here
 * would misattribute a real person's name to the wrong place, which is
 * worse than saying "Unable to verify."
 */
async function resolveByLabelWithOfficeholder(name: string, classQid: string, countryQid: string, parentQid: string | null, timeoutMs?: number) {
  const parentFilter = parentQid
    ? `{ ?place wdt:P131 wd:${parentQid} . } UNION { ?place wdt:P131 ?mid . ?mid wdt:P131 wd:${parentQid} . }`
    : "";

  const query = `
    SELECT DISTINCT ?place ?placeLabel ?hog ?hogLabel ?hogStart WHERE {
      ?place rdfs:label ?label .
      FILTER(LANG(?label) = "en")
      FILTER(LCASE(STR(?label)) = LCASE("${sparqlEscape(name)}"))
      ?place wdt:P31/wdt:P279* wd:${classQid} .
      ?place wdt:P17 wd:${countryQid} .
      ${parentFilter}
      OPTIONAL {
        ?place p:P6 ?hogStmt .
        ?hogStmt ps:P6 ?hog .
        FILTER NOT EXISTS { ?hogStmt pq:P582 ?hogEnd }
        OPTIONAL { ?hogStmt pq:P580 ?hogStart }
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
    }
    LIMIT 10
  `;

  const rows = await sparqlQuery(query, timeoutMs);
  const distinctPlaces = new Set(rows.map((r) => qidFromUri(r.place?.value)).filter(Boolean));
  if (distinctPlaces.size !== 1) return null; // no match, or genuinely ambiguous - never guess between them

  const placeQid = [...distinctPlaces][0]!;
  // Falls back to the searched name (the caller's own real input) rather
  // than to a bare QID - same "never display a code as if it were a name"
  // rule as everywhere else in this file.
  const placeLabel = realLabelOrNull(rows.find((r) => qidFromUri(r.place?.value) === placeQid)?.placeLabel?.value) ?? name;
  const withHog = rows.find((r) => qidFromUri(r.place?.value) === placeQid && r.hog?.value);
  const hogName = realLabelOrNull(withHog?.hogLabel?.value);

  return {
    place: { qid: placeQid, label: placeLabel },
    headOfGovernment: hogName ? { name: hogName, since: withHog?.hogStart?.value ?? null } : null,
  };
}

/**
 * City/town/village by exact (case-insensitive) English label, scoped to
 * the resolved country and optionally the resolved state (a two-hop P131
 * check, not a slow transitive walk - see resolveByLabelWithOfficeholder).
 * Q486972 "human settlement" is the broad class covering cities, towns and
 * villages alike, matching how Nominatim itself merges city/town/village
 * into one address field.
 */
export function resolveCityWithOfficeholder(name: string, countryQid: string, stateQid: string | null, timeoutMs?: number) {
  return resolveByLabelWithOfficeholder(name, "Q486972", countryQid, stateQid, timeoutMs);
}

/**
 * District/county by exact label, scoped the same way as city. Q56061
 * "administrative territorial entity" is deliberately broad - district-type
 * classes vary a lot by country - but Wikidata's coverage of district-level
 * officeholders (e.g. Indian District Magistrates) is genuinely thin, so
 * this is expected to resolve the PLACE far more often than it finds a P6
 * officeholder statement. That's the honest "where reliable data is
 * available" behavior the feature is supposed to have, not a bug.
 */
export function resolveDistrictWithOfficeholder(name: string, countryQid: string, stateQid: string | null, timeoutMs?: number) {
  return resolveByLabelWithOfficeholder(name, "Q56061", countryQid, stateQid, timeoutMs);
}
