import type { RoutePoint } from "@/stores/routeStore";
import type { RouteMode } from "@/types/intel";

export interface BookingLink {
  label: string;
  url: string;
}

/**
 * "Book a ride from this route" handoff links on the Directions panel — real
 * provider URLs only, never a fabricated price/ETA/availability. Split out
 * from DirectionsPanel.tsx (same pattern as src/features/travel/providers.ts)
 * so this pure URL-building logic is unit-testable without a component
 * render harness.
 *
 * Uber and Google Maps have documented public deep-link schemes that accept
 * coordinates directly, so those two are genuinely prefilled. Rapido and Ola
 * do not expose a public web booking URL that accepts a pickup/drop pair
 * (both are app-only via native intents) — linking to their homepage is the
 * honest option rather than inventing a URL scheme that doesn't exist.
 */
export function bookingLinks(from: RoutePoint | null, to: RoutePoint | null, mode: RouteMode): BookingLink[] {
  const dest = to ? `${to.lat},${to.lon}` : "";
  const origin = from ? `${from.lat},${from.lon}` : "";
  // Apple's own documented web URL scheme (maps.apple.com — redirects to the
  // native app on iOS/macOS, renders as a web map elsewhere: developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference).
  // dirflg only has d(rive)/w(alk)/r(transit) — no dedicated bike flag — so
  // "bike" falls back to driving directions rather than silently dropping
  // the mode.
  const appleDirflg = mode === "walk" ? "w" : "d";
  return [
    { label: "Uber", url: `https://m.uber.com/looking?pickup=${origin || "my_location"}&drop[0]=${dest}` },
    { label: "Rapido", url: "https://www.rapido.bike/" },
    { label: "Ola", url: "https://www.olacabs.com/" },
    { label: "Google Maps", url: to ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}` : "https://maps.google.com" },
    {
      label: "Apple Maps",
      url: to
        ? `https://maps.apple.com/?${origin ? `saddr=${origin}&` : ""}daddr=${dest}&dirflg=${appleDirflg}`
        : "https://maps.apple.com/",
    },
  ];
}
