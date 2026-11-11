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
import "./StarterCard.css";

const DISMISSED_KEY = "manowj.starter.dismissed.v1";

/** Real localities people check before renting or buying, one tap each. */
const EXAMPLES: Array<{ name: string; where: string; lat: number; lon: number }> = [
  { name: "Gachibowli", where: "Hyderabad", lat: 17.4401, lon: 78.3489 },
  { name: "Koramangala", where: "Bengaluru", lat: 12.9352, lon: 77.6245 },
  { name: "Andheri West", where: "Mumbai", lat: 19.1364, lon: 72.8296 },
];

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
      <p className="starter__text">See the hospitals, schools, metro and shops around it, with the source of every figure. Free, no sign-up.</p>
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
