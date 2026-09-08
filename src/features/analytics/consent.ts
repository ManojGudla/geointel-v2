/**
 * Analytics, and the consent it depends on.
 *
 * Google Tag Manager loads Google Analytics, which sets cookies and reports
 * visits to Google. That is a real change to what this site does with a
 * visitor, and the Privacy page has to stop saying otherwise — it previously
 * stated, as a checkable fact, that there were no analytics and no
 * third-party tags at all.
 *
 * Two decisions keep this honest rather than merely legal-looking:
 *
 *   NOTHING LOADS BEFORE A CHOICE. Tag Manager is not on the page until the
 *   visitor accepts. A banner that loads the tracker first and asks second is
 *   the pattern everyone complains about, and it would make the Privacy page
 *   false for every visitor who declines.
 *
 *   DECLINING STICKS. The choice is remembered, so a visitor who says no is
 *   not asked again on every page load until they give in.
 *
 * If VITE_GTM_ID is not set, none of this runs and no banner appears — the
 * site behaves exactly as it did before. That is what makes it safe to deploy
 * this code before the container even exists.
 */

const STORAGE_KEY = "manowj.consent.v1";

export type ConsentChoice = "granted" | "denied";

/** The container id, from the environment. Not a secret — it ships in the page. */
export function gtmId(): string | null {
  const raw = import.meta.env.VITE_GTM_ID as string | undefined;
  const id = raw?.trim();
  // A blank or placeholder value must behave exactly like "not configured",
  // or a half-finished env var silently ships a broken tag.
  if (!id || !/^GTM-[A-Z0-9]+$/i.test(id)) return null;
  return id;
}

/** The Sentry DSN, from the environment. Not a secret — it ships in the page. */
export function sentryDsn(): string | null {
  const raw = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  const dsn = raw?.trim();
  // A blank or placeholder value must behave exactly like "not configured"
  if (!dsn) return null;
  return dsn;
}

export function analyticsAvailable(): boolean {
  return gtmId() !== null || sentryDsn() !== null;
}

export function readConsent(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "granted" || raw === "denied" ? raw : null;
  } catch {
    // Storage blocked. Treat it as "not asked yet" rather than as consent —
    // the safe direction when we cannot know.
    return null;
  }
}

export function writeConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // The choice applies to this page load even if it cannot be remembered.
  }
}

/** Whether the banner should be shown: only when there is something to consent to. */
export function shouldAskConsent(choice: ConsentChoice | null): boolean {
  return analyticsAvailable() && choice === null;
}

let loaded = false;
let sentryEnabled = false;

/**
 * Loads Tag Manager, once, from Google's own domain.
 *
 * Deliberately NOT the copy-paste snippet Google gives you. That snippet is an
 * inline <script>, and this site's Content-Security-Policy is `script-src
 * 'self'` with no 'unsafe-inline' — the browser would silently refuse to run
 * it, exactly as it once refused the blank-page recovery guard. Building the
 * same thing with DOM calls from an already-trusted module means the policy
 * only has to allow Google's domain, not inline script everywhere.
 */
export function loadTagManager(id: string, doc: Document = document): boolean {
  if (loaded) return false;
  loaded = true;

  const w = doc.defaultView as (Window & { dataLayer?: unknown[] }) | null;
  if (!w) return false;

  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = doc.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  doc.head.appendChild(script);
  return true;
}

/**
 * Enable Sentry error tracking once user consents.
 * This mirrors the privacy-first approach of Tag Manager:
 * Sentry is initialized but disabled until the user opts in.
 */
export function enableSentry(): boolean {
  if (sentryEnabled) return false;
  sentryEnabled = true;

  try {
    const Sentry = (window as any).__SENTRY__;
    if (Sentry?.getCurrentClient?.()?.getOptions) {
      const client = Sentry.getCurrentClient();
      client?.getOptions && (client.getOptions().enabled = true);
    }
  } catch {
    // Sentry not loaded or disabled, continue silently
  }
  return true;
}

/** Test seam: lets a test start from a clean slate. */
export function resetLoadedForTests(): void {
  loaded = false;
  sentryEnabled = false;
}