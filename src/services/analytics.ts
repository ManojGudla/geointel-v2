import { readConsent } from "@/features/analytics/consent";

/**
 * Product analytics, and the reason this file did not exist until now.
 *
 * Google Tag Manager has been loading on this site for some time, so page
 * views were counted. Nothing else was. Not one custom event was ever fired,
 * which means every question worth asking about this product had no answer:
 * how many visitors start a search, how many finish one, how many searches
 * fail, whether anyone shares a result, whether anyone comes back. Traffic
 * was measurable and behaviour was not, and behaviour is the only half that
 * tells you what to build next.
 *
 * Three rules this file holds, and they are the reason it is a module rather
 * than scattered dataLayer.push calls.
 *
 * NOTHING FIRES WITHOUT CONSENT. Every call checks the stored choice at the
 * moment it happens. A visitor who declined generates no events at all, and a
 * visitor who has not answered yet generates none either — not queued, not
 * buffered for later, simply not collected. Queuing them would make the
 * consent question retroactive, which is not consent.
 *
 * NO PERSONAL DATA, ENFORCED HERE RATHER THAN PROMISED. Coordinates are the
 * obvious hazard: a precise lat/lon IS a person's location, and attaching one
 * to an event would ship exactly the thing this app's privacy page says it
 * does not collect. Properties are filtered to a small allowlist of shapes,
 * strings are capped, and anything numeric that looks like a coordinate is
 * refused outright by `scrubProps`. Search text is never sent — only its
 * length and whether it parsed.
 *
 * EVENT NAMES ARE A CLOSED SET. A typo'd event name is not an error, it is a
 * silently empty funnel step that nobody notices for a month. The union type
 * below makes a wrong name a compile failure.
 */

/**
 * The funnel, written out.
 *
 * These are ordered to match the journey rather than grouped by feature,
 * because the point of having them is to see where people stop.
 */
export type AnalyticsEvent =
  // Acquisition and activation
  | "search_started"
  | "search_completed"
  | "search_failed"
  | "map_opened"
  | "place_opened"
  | "onboarding_example_used"
  | "onboarding_dismissed"
  // Core tools
  | "route_started"
  | "radius_created"
  | "area_measured"
  | "distance_measured"
  | "basemap_changed"
  | "layer_opened"
  | "ai_question_asked"
  | "ai_question_failed"
  // Sharing, which is the growth loop
  | "result_shared"
  | "result_link_copied"
  | "portal_opened"
  // Play
  | "daily_game_started"
  | "daily_game_completed"
  | "game_started"
  // Trust and feedback
  | "feedback_submitted"
  | "data_issue_reported";

export type AnalyticsProps = Record<string, string | number | boolean | undefined>;

interface DataLayerWindow extends Window {
  dataLayer?: unknown[];
}

/**
 * Anything that could be a coordinate is refused.
 *
 * Not "rounded", not "truncated" — refused. A rounded coordinate is still a
 * coordinate, and the moment one becomes acceptable in an event the rule stops
 * being checkable. The bound is deliberately wide: any finite number that
 * could be a latitude or longitude is treated as one unless the property name
 * makes it unambiguous (a radius in metres, a count, a duration).
 */
const SAFE_NUMERIC_KEYS = new Set([
  "count",
  "radiusMeters",
  "durationMs",
  "score",
  "attempts",
  "queryLength",
  "resultCount",
  "zoom",
  "streak",
  "rating",
]);

export function scrubProps(props: AnalyticsProps | undefined): AnalyticsProps {
  if (!props) return {};
  const out: AnalyticsProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (/lat|lon|lng|coord|address|query|name|email|user/i.test(key)) continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      if (!SAFE_NUMERIC_KEYS.has(key)) continue;
      out[key] = Math.round(value * 100) / 100;
      continue;
    }
    if (typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    // Strings are category labels, not free text. Capped hard so a stray
    // question or place name can never ride along in one.
    out[key] = String(value).slice(0, 60);
  }
  return out;
}

/**
 * Records one thing that happened.
 *
 * Never throws and never awaits. An analytics call sits in the middle of real
 * user actions — a search submit, a share tap — and an exception or a delay
 * there would break the feature it is measuring, which is the one outcome
 * worse than having no measurement at all.
 */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  try {
    if (typeof window === "undefined") return;
    // Checked at the moment of the event, not cached at load: a visitor can
    // decline after the page has been open for a while, and that must take
    // effect immediately.
    if (readConsent() !== "granted") return;

    const w = window as DataLayerWindow;
    if (!Array.isArray(w.dataLayer)) return;
    w.dataLayer.push({ event, ...scrubProps(props) });
  } catch {
    // Measurement must never be able to break the thing it measures.
  }
}
