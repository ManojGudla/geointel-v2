/**
 * What this app actually does with your data — written from the code, not
 * from a template.
 *
 * Every claim below corresponds to something verifiable in this repository,
 * and the `where` field says where. That constraint is the point: a privacy
 * page that promises more than the code does is worse than no page at all,
 * and this one is meant to be checkable by anyone who asks.
 *
 * Anything NOT yet true is listed under `notYet` rather than quietly omitted.
 */

export interface Fact {
  claim: string;
  detail: string;
  /** The file or setting that makes this true. */
  where: string;
}

export const NO_ACCOUNT_FACTS: Fact[] = [
  {
    claim: "There is no sign-up and no account",
    detail:
      "You can't create a login here, because there isn't one. Nothing you do is tied to a person, an email address or a profile.",
    where: "No auth provider is configured anywhere in the app",
  },
  {
    claim: "Nothing you search is stored on a server",
    detail:
      "Your recent searches, selected places, layers and analysis results live in your own browser and are sent nowhere. Clearing your browser data erases them completely.",
    where: "src/stores/searchStore.ts — localStorage only",
  },
  {
    claim: "Game scores stay on your device",
    detail:
      "XP, streaks, personal bests and achievements are saved in this browser. There is no leaderboard and no comparison against other players, because there is no server holding anyone's scores.",
    where: "src/features/play/progress/playStore.ts",
  },
  {
    claim: "Your location is used, never stored",
    detail:
      "Pressing 'use my location' sends your coordinates to this site's own server once, to turn them into a street address, and starting navigation sends them to work out the route. Nothing is written to a database and no history is kept. While navigating, your position is used to follow the route and is discarded when you stop.",
    where: "api/_routes/reverse-geocode.ts and api/_routes/route.ts — answered and dropped, never written; both marked private so no shared cache keeps them",
  },
];

export const REQUEST_FACTS: Fact[] = [
  {
    claim: "Map data comes from public sources, through this app",
    detail:
      "Place names come from OpenStreetMap/Nominatim, features from Overpass, routes from OSRM, weather from Open-Meteo, earthquakes from USGS, satellite imagery from Esri and NASA. Requests go through this app's own API rather than straight from your browser, so those providers never see your browser or IP.",
    where: "api/_routes/ — every provider is called server-side",
  },
  {
    claim: "Every endpoint is rate limited",
    detail:
      "Each API route caps requests per minute per IP address. It protects the free upstream services this project depends on, and stops one visitor degrading the app for everyone else.",
    where: "api/_lib/cache.ts RateLimiter, used in all 15 routes",
  },
  {
    claim: "API keys never reach your browser",
    detail:
      "The keys for the services that need one are read server-side only. Nothing in the JavaScript you download contains a secret.",
    where: "process.env in api/ only; no VITE_-prefixed secrets",
  },
  {
    claim: "Analytics only if you say yes",
    detail:
      "Google Analytics is available on this site, and it is NOT loaded until you accept the banner. Decline and nothing from Google is fetched, no cookies are set, and the site works identically. Your choice is remembered so you are not asked again.",
    where: "src/features/analytics/consent.ts — the tag loads only after consent",
  },
  {
    claim: "There are no ad scripts and no other trackers",
    detail:
      "No advertising tags, no social pixels, no session recording. The content security policy names every domain the page may talk to, and Google's analytics domains are the only ones on that list that are not map or weather data.",
    where: "vercel.json Content-Security-Policy",
  },
];

export const BROWSER_FACTS: Fact[] = [
  {
    claim: "The page can only load code from itself",
    detail:
      "A strict Content-Security-Policy allows scripts from this site alone, and images and network requests only from the named map and data providers. If something tried to inject a script, the browser would refuse to run it.",
    where: "vercel.json Content-Security-Policy",
  },
  {
    claim: "The site can't be embedded in someone else's page",
    detail:
      "X-Frame-Options DENY and frame-ancestors 'none' stop this app being framed inside another site — the trick used to make you click something you didn't intend to.",
    where: "vercel.json X-Frame-Options / frame-ancestors",
  },
  {
    claim: "Your address bar is not leaked to other sites",
    detail:
      "Referrer-Policy is set to strict-origin-when-cross-origin, so a site you click through to sees only that you came from here — never which place you were looking at.",
    where: "vercel.json Referrer-Policy",
  },
  {
    claim: "Files are served as their real type",
    detail: "X-Content-Type-Options nosniff stops the browser guessing that a file is something it isn't.",
    where: "vercel.json X-Content-Type-Options",
  },
];

export const SUBMITTED_FACTS: Fact[] = [
  {
    claim: "Feedback and job applications are the only things you can send",
    detail:
      "Those two forms are the only places anything you type leaves your browser. They're stored so a human can read and reply to them.",
    where: "api/_routes/feedback.ts, api/_routes/team-apply.ts",
  },
  {
    claim: "What you send is validated before it's stored",
    detail:
      "Every field is length-checked and type-checked server-side. Nothing you type is ever executed or interpreted as code.",
    where: "Input validation in each handler",
  },
];

/**
 * Not true yet. Listed because a security page that only lists strengths is
 * marketing, not information — and because anyone deciding whether to trust
 * this with real work needs to know the gaps.
 */
export const NOT_YET: Fact[] = [
  {
    claim: "No end-to-end encryption of stored feedback",
    detail:
      "Feedback and applications are stored with the database's own encryption at rest, not encrypted so that only you could read them. Don't put anything confidential in those boxes.",
    where: "Planned",
  },
  {
    claim: "No accounts means no private saved work",
    detail:
      "Because there's no login, there's also no way to keep your projects private to you across devices — everything is per-browser. Accounts are a real piece of work, not a switch, so they're marked planned rather than hinted at.",
    where: "Planned",
  },
  {
    claim: "Accepting analytics shares your visit with Google",
    detail:
      "If you accept, Google receives your visit the way it does on any site using Analytics — including your IP address and which pages you opened. That is Google's system, not this one, and it is not something this app can promise anything about. If that matters to you, decline: everything still works.",
    where: "Google Analytics via Tag Manager",
  },
  {
    claim: "No independent security audit",
    detail:
      "The measures above are real and checkable, but no third party has reviewed them. If you're evaluating this for organisational use, that's a fair thing to ask about.",
    where: "Planned",
  },
];

export const SECTIONS: Array<{ id: string; title: string; icon: string; facts: Fact[]; intro: string }> = [
  {
    id: "account",
    title: "You stay anonymous",
    icon: "🕶️",
    intro: "The strongest privacy guarantee any app can give is not collecting the data in the first place.",
    facts: NO_ACCOUNT_FACTS,
  },
  {
    id: "requests",
    title: "Where the data comes from",
    icon: "🌐",
    intro: "Everything on the map is from a named public source, and you can see which one on every panel.",
    facts: REQUEST_FACTS,
  },
  {
    id: "browser",
    title: "How the page itself is protected",
    icon: "🛡️",
    intro: "Security headers your browser enforces, whatever the app's own code tries to do.",
    facts: BROWSER_FACTS,
  },
  {
    id: "submitted",
    title: "The only things you send us",
    icon: "✉️",
    intro: "Two forms. Nothing else you do here is transmitted.",
    facts: SUBMITTED_FACTS,
  },
  {
    id: "notyet",
    title: "What isn't true yet",
    icon: "📋",
    intro: "Listed on purpose. A page that only lists strengths isn't worth reading.",
    facts: NOT_YET,
  },
];
