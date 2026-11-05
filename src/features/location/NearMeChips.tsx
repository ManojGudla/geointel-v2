import { useState } from "react";
import { useLiveLocationStore, waitForFix } from "./liveLocationStore";
import { useLocationStore } from "@/stores/locationStore";
import { useMapStore } from "@/stores/mapStore";
import { useShellStore } from "@/stores/shellStore";
import { useRunAnalysis } from "@/features/analysis/useRunAnalysis";
import type { NearbyCategory } from "@/types/intel";
import "./NearMeChips.css";

interface Chip {
  id: NearbyCategory;
  icon: string;
  label: string;
  /** Wider for things that are sparse; must be one of the Analyse panel's distances. */
  radiusMeters: number;
}

const CHIPS: Chip[] = [
  { id: "petrol", icon: "⛽", label: "Petrol", radiusMeters: 5000 },
  { id: "atms", icon: "🏧", label: "ATM", radiusMeters: 2000 },
  { id: "hospitals", icon: "🏥", label: "Hospital", radiusMeters: 5000 },
  { id: "restaurants", icon: "🍽️", label: "Food", radiusMeters: 2000 },
  { id: "publicTransport", icon: "🚇", label: "Metro & bus", radiusMeters: 2000 },
  { id: "pharmacies", icon: "💊", label: "Pharmacy", radiusMeters: 2000 },
  { id: "cafes", icon: "☕", label: "Café", radiusMeters: 2000 },
];

/**
 * One-tap "near me" searches, the way Google Maps puts Restaurants, Petrol
 * and ATMs right under its search box.
 *
 * "Near me" means near YOU: a tap starts live location (from inside the tap,
 * which iOS requires) and waits a few seconds for a fix. If location is
 * blocked or slow, it still answers - around the selected place, or the
 * centre of the map - and the Analyse panel says which point it measured
 * from, so nobody mistakes the map centre for where they are standing.
 */
export function NearMeChips() {
  const [busy, setBusy] = useState<NearbyCategory | null>(null);
  const run = useRunAnalysis();
  const openSection = useShellStore((s) => s.openSection);
  const setSelectedLocation = useLocationStore((s) => s.setSelectedLocation);

  const search = async (chip: Chip) => {
    setBusy(chip.id);
    let origin: { lat: number; lon: number };
    try {
      const fix = await waitForFix(12_000);
      origin = { lat: fix.lat, lon: fix.lon };
      // Selecting it means the Analyse panel says "from My Location", not "from the centre of the map".
      setSelectedLocation({ lat: fix.lat, lon: fix.lon, displayName: "My Location", name: "My Location", address: {}, source: "Your device's location" });
      useLiveLocationStore.getState().setFollowing(false);
    } catch {
      const selected = useLocationStore.getState().selectedLocation;
      const center = useMapStore.getState().center;
      origin = selected ? { lat: selected.lat, lon: selected.lon } : { lat: center[1], lon: center[0] };
    }
    openSection("tools");
    await run({ operation: "within", origin, category: chip.id, radiusMeters: chip.radiusMeters }).catch(() => undefined);
    setBusy(null);
  };

  return (
    <div className="near-me" role="group" aria-label="Find near me">
      {CHIPS.map((chip) => (
        <button key={chip.id} type="button" className="near-me__chip" onClick={() => void search(chip)} disabled={busy !== null} aria-busy={busy === chip.id}>
          <span aria-hidden="true">{chip.icon}</span>
          {busy === chip.id ? "Finding…" : chip.label}
        </button>
      ))}
    </div>
  );
}
