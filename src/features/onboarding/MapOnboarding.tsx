import { useState } from "react";
import { useLocationStore } from "@/stores/locationStore";
import { useConsentAsking, useOnboardingStore, useOnboardingVisible } from "./onboardingVisibility";
import { useMapStore } from "@/stores/mapStore";
import { useSearchStore } from "@/stores/searchStore";
import { useShellStore } from "@/stores/shellStore";
import { useRunAnalysis } from "@/features/analysis/useRunAnalysis";
import { parseMapCommand } from "@/features/ai/mapCommands";
import type { AnalysisRequest } from "@/features/analysis/runAnalysis";
import { reverseGeocode } from "@/services/geocode";
import "./MapOnboarding.css";

/**
 * What a first-time visitor sees before they have done anything.
 *
 * The brief for this screen was ten seconds: someone who has never heard of
 * GIS should understand what this application is for, and be one click from
 * proving it. So it states the promise in two short lines and then hands
 * over five things to press — every one of which runs a real query, not a
 * tour.
 *
 * Two deliberate constraints. It never covers the whole map (the map is the
 * product, and hiding it to explain it would be self-defeating), and it
 * disappears the moment a location exists — including when the user ignores
 * it entirely and just clicks the map, which the copy explicitly invites.
 */
interface Example {
  icon: string;
  label: string;
  /** A place to select outright. */
  place?: { name: string; lat: number; lon: number };
  /** A spatial question to run, from the current map centre. */
  question?: string;
}

const EXAMPLES: Example[] = [
  { icon: "📍", label: "Find Charminar", place: { name: "Charminar, Hyderabad", lat: 17.361664, lon: 78.474663 } },
  { icon: "🏥", label: "Hospitals · 2 km", question: "hospitals within 2 km" },
  { icon: "☕", label: "Good spot for a café?", question: "is this a good place for a restaurant" },
  { icon: "🏫", label: "Schools · 1 km", question: "schools within 1 km" },
  { icon: "🧭", label: "What's within 800 m", question: "what is within 800 m" },
];

export function MapOnboarding() {
  const setSelectedLocation = useLocationStore((s) => s.setSelectedLocation);
  const mapCenter = useMapStore((s) => s.center);
  const requestCamera = useMapStore((s) => s.requestCamera);
  const setQuery = useSearchStore((s) => s.setQuery);
  const openSection = useShellStore((s) => s.openSection);
  const run = useRunAnalysis();

  // Shared rather than local: the September teaser has to know whether this
  // card is up, or the two overlap. See onboardingVisibility.ts.
  const visible = useOnboardingVisible();
  /*
    Not a condition on showing this card — it used to be, and that meant the
    card never appeared on a first visit, which is the only visit it is for.
    It is spacing: while the banner is up, the card sits higher so the two
    cannot overlap and the Dismiss button stays clickable.
  */
  const consentAsking = useConsentAsking();
  const dismiss = useOnboardingStore((s) => s.dismiss);
  const [busy, setBusy] = useState<string | null>(null);

  if (!visible) return null;

  const pickPlace = async (place: NonNullable<Example["place"]>) => {
    setBusy(place.name);
    setQuery(place.name);
    // Shown immediately from known coordinates; the reverse lookup only
    // enriches the address afterwards, so a slow or rate-limited geocoder
    // never blocks the first thing a new user does.
    setSelectedLocation({ lat: place.lat, lon: place.lon, displayName: place.name, name: place.name.split(",")[0]!, address: {}, source: "OpenStreetMap / Nominatim" });
    requestCamera({ center: [place.lon, place.lat], zoom: 15 });
    try {
      const full = await reverseGeocode(place.lat, place.lon);
      setSelectedLocation({ ...full, name: place.name.split(",")[0]! });
    } catch {
      // Keep the point that's already selected.
    }
    setBusy(null);
  };

  const askQuestion = async (question: string) => {
    const command = parseMapCommand(question);
    if (!command) return;
    setBusy(question);
    setQuery(question);

    const origin = { lat: mapCenter[1], lon: mapCenter[0] };
    const request: AnalysisRequest =
      command.operation === "suitability"
        ? { operation: "suitability", origin, presetId: command.presetId, radiusMeters: command.radiusMeters }
        : command.operation === "nearest"
          ? { operation: "nearest", origin, category: command.category, radiusMeters: 10_000 }
          : command.operation === "buffer"
            ? { operation: "buffer", origin, radiusMeters: command.radiusMeters }
            : { operation: "within", origin, category: command.category, radiusMeters: command.radiusMeters };

    openSection("tools");
    await run(request).catch(() => undefined);
    setBusy(null);
    dismiss();
  };

  return (
    <div className={`onboarding${consentAsking ? " onboarding--above-consent" : ""}`} role="region" aria-label="Getting started">
      <div className="onboarding__card">
        {/*
          The way out, pinned.

          The footer at the bottom of this card carries a Dismiss button too,
          but the card can be taller than a phone screen leaves room for, and
          anything at the bottom of a scrolling card can be below the fold. The
          one control this screen must never hide is the way to close it, so it
          also lives here, in the corner where everybody already looks for it,
          where no amount of content below can push it off.
        */}
        <button type="button" className="onboarding__close" onClick={dismiss} aria-label="Close">
          ✕
        </button>
        <h1 className="onboarding__headline">
          Understand any place.
          <br />
          Analyse any area.
        </h1>
        <p className="onboarding__sub">Search a location, click anywhere on the map, or type what you want to find.</p>

        <div className="onboarding__examples">
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              disabled={busy !== null}
              onClick={() => (example.place ? void pickPlace(example.place) : void askQuestion(example.question!))}
            >
              <span aria-hidden="true">{example.icon}</span>
              {busy === (example.place?.name ?? example.question) ? "Working…" : example.label}
            </button>
          ))}
        </div>

        <div className="onboarding__foot">
          <span>Or click anywhere on the map</span>
          <button type="button" className="onboarding__skip" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
