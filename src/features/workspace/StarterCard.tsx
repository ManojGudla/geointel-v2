import { useState } from "react";
import { useLocationStore } from "@/stores/locationStore";
import { useMapStore } from "@/stores/mapStore";
import { useSearchStore } from "@/stores/searchStore";
import { useShellStore } from "@/stores/shellStore";
import { useIntelTabStore } from "@/stores/intelTabStore";
import { useMeasureStore } from "@/stores/measureStore";
import { useFreeNoticeStore } from "@/features/notice/freeNoticeStore";
import { reverseGeocode } from "@/services/geocode";
import { track } from "@/services/analytics";
import { isIndiaTimeZone, visitorTimeZone } from "@/lib/visitorRegion";
import "./StarterCard.css";

const DISMISSED_KEY = "manowj.starter.dismissed.v1";

type Example = { name: string; where: string; lat: number; lon: number };

/** Real localities people check before renting or buying, one tap each. */
export const INDIA_EXAMPLES: Example[] = [
  { name: "Gachibowli", where: "Hyderabad", lat: 17.4401, lon: 78.3489 },
  { name: "Koramangala", where: "Bengaluru", lat: 12.9352, lon: 77.6245 },
  { name: "Andheri West", where: "Mumbai", lat: 19.1364, lon: 72.8296 },
];

/**
 * The same idea for everyone else. Three Indian neighbourhood names mean
 * nothing to a visitor in Manchester or Toronto and quietly say "this is not
 * for you". These are places people abroad really do check before renting,
 * many of them students and new arrivals from India.
 */
export const WORLD_EXAMPLES: Example[] = [
  { name: "Fallowfield", where: "Manchester", lat: 53.4416, lon: -2.2265 },
  { name: "Jersey City", where: "New Jersey", lat: 40.7191, lon: -74.0506 },
  { name: "Brampton", where: "Ontario", lat: 43.689, lon: -79.759 },
];

/** Indian examples for visitors in India and when the zone is unknown. */
export function examplesFor(tz: string | null): Example[] {
  return tz === null || isIndiaTimeZone(tz) ? INDIA_EXAMPLES : WORLD_EXAMPLES;
}

const EXAMPLES = examplesFor(visitorTimeZone());

const EXAMPLE_RADIUS_METERS = 1000;

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Says what this app is for, on the first screen, with three things to tap.
 *
 * A map and a search box do not say why you would use this instead of the map
 * app already on your phone. This does, in one line, and the examples show it:
 * each selects a real locality and opens what is mapped around it.
 *
 * It is NOT a pop-up, and that is deliberate. The getting-started card this
 * replaces floated over the bottom of the map, collided with other overlays
 * and was reported as hard to close. This one is part of the search column,
 * in normal flow under the chips: it covers nothing, moves nothing when it
 * goes, and leaves by itself the moment a place is chosen. The ✕ hides it for
 * good on this device.
 */
export function StarterCard() {
  const location = useLocationStore((s) => s.selectedLocation);
  const setSelectedLocation = useLocationStore((s) => s.setSelectedLocation);
  const setRadiusMeters = useLocationStore((s) => s.setRadiusMeters);
  const requestCamera = useMapStore((s) => s.requestCamera);
  const query = useSearchStore((s) => s.query);
  const openSection = useShellStore((s) => s.openSection);
  const setIntelTab = useIntelTabStore((s) => s.setTab);
  const measuring = useMeasureStore((s) => s.mode !== "off");
  const noticeOpen = useFreeNoticeStore((s) => s.isOpen);
  const [dismissed, setDismissed] = useState(wasDismissed);

  // Gone while there is a place, while somebody is typing (the suggestions
  // list needs the room), while measuring, and behind the first-visit notice.
  if (dismissed || location || query.trim() !== "" || measuring || noticeOpen) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Hidden for this visit only.
    }
    setDismissed(true);
    track("onboarding_dismissed");
  };

  const pick = async (example: (typeof EXAMPLES)[number]) => {
    const displayName = `${example.name}, ${example.where}`;
    track("onboarding_example_used", { kind: "place" });
    // The coordinates are known, so the place is selected at once; the
    // address lookup only enriches it afterwards.
    setSelectedLocation({
      lat: example.lat,
      lon: example.lon,
      displayName,
      name: example.name,
      address: {},
      source: "OpenStreetMap / Nominatim",
    });
    // A neighbourhood, not a block. At the default 250 m most categories
    // around a locality's centre point read 0, which makes the example look
    // empty; 1 km is the distance the headline is actually talking about.
    setRadiusMeters(EXAMPLE_RADIUS_METERS);
    requestCamera({ center: [example.lon, example.lat], zoom: 15 });
    setIntelTab("evidence");
    openSection("place");
    try {
      const full = await reverseGeocode(example.lat, example.lon);
      // Only if the visitor is still on this example.
      const current = useLocationStore.getState().selectedLocation;
      if (current && current.lat === example.lat && current.lon === example.lon) setSelectedLocation({ ...full, name: example.name });
    } catch {
      // Already selected and every panel works from it.
    }
  };

  return (
    <section className="starter" aria-label="What you can do here">
      <button type="button" className="starter__close" onClick={dismiss} aria-label="Hide this tip">
        ✕
      </button>
      <h2 className="starter__headline">Check any address in seconds</h2>
      <p className="starter__text">
        See the hospitals, schools, transit and shops around it, with the source of every figure. Then ask the{" "}
        <button type="button" className="starter__link" onClick={() => openSection("ai")}>
          🤖 AI agents
        </button>{" "}
        to explain it. Free, no sign-up.
      </p>
      <div className="starter__examples">
        <span className="starter__try">Try:</span>
        {EXAMPLES.map((example) => (
          <button key={example.name} type="button" onClick={() => void pick(example)} title={`${example.name}, ${example.where}`}>
            {example.name}
          </button>
        ))}
      </div>
    </section>
  );
}
