/**
 * What to tell someone whose location did not come through - specific to
 * their device, because the fix on an iPhone is in a completely different
 * place from the fix on Android, and "permission denied" tells nobody
 * where to go.
 */

export type LocationProblem = "denied" | "unavailable" | "slow" | "unsupported";

export function detectPlatform(ua = typeof navigator !== "undefined" ? navigator.userAgent : "", touchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0) {
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const android = /Android/i.test(ua);
  // In-app browsers commonly block location for every website.
  const inApp = /FBAN|FBAV|Instagram|LinkedInApp|Snapchat|Line\/|Twitter|GSA\//i.test(ua);
  return { ios, android, inApp };
}

export function locationHelp(problem: LocationProblem, platform = detectPlatform()): string {
  if (problem === "unsupported") {
    return "This browser can't share your location. Search for a place instead, or open the site in Safari or Chrome.";
  }

  if (platform.inApp && (problem === "denied" || problem === "unavailable")) {
    return platform.ios
      ? "This app's built-in browser blocks location. Tap ⋯ or the share icon and choose \"Open in Safari\", then try again."
      : "This app's built-in browser blocks location. Tap ⋮ and choose \"Open in Chrome\" (or your browser), then try again.";
  }

  if (problem === "denied") {
    if (platform.ios) {
      return "Location is blocked for this site. On your iPhone: Settings → Privacy & Security → Location Services → turn it On, then Safari Websites → \"While Using the App\". Also tap \"aA\" in Safari's address bar → Website Settings → Location → Allow. Then tap the location button again.";
    }
    if (platform.android) {
      return "Location is blocked for this site. Tap the icon left of the address bar → Permissions → Location → Allow, and make sure Location is on in your phone's quick settings. Then tap the location button again.";
    }
    return "Location is blocked for this site. Click the icon left of the address bar, allow Location, then try again.";
  }

  if (problem === "slow") {
    return platform.ios || platform.android
      ? "Still looking for you. Step near a window or outdoors, and check Location is on in your phone's settings."
      : "Your location is taking a while. Check Location is on for this browser, or search for a place instead.";
  }

  // unavailable
  return platform.ios
    ? "Your iPhone couldn't find your position. Check Settings → Privacy & Security → Location Services is On, then try again."
    : "Your device couldn't find your position just now. Check Location is on, then try again.";
}
