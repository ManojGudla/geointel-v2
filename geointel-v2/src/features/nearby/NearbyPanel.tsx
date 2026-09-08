import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AsyncPanel } from "@/components/AsyncPanel";
import { fetchNearby } from "@/services/intel";
import { formatDistance } from "@/features/map/geo";
import { useLocationStore } from "@/stores/locationStore";
import { useUiStore } from "@/stores/uiStore";
import type { NearbyCategory } from "@/types/intel";
import "./NearbyPanel.css";

const CATEGORIES: Array<{ id: NearbyCategory; label: string; icon: string }> = [
  { id: "restaurants", label: "Restaurants", icon: "🍽️" },
  { id: "cafes", label: "Cafes", icon: "☕" },
  { id: "hotels", label: "Hotels", icon: "🏨" },
  { id: "hospitals", label: "Hospitals", icon: "🏥" },
  { id: "schools", label: "Schools", icon: "🏫" },
  { id: "atms", label: "ATMs", icon: "🏧" },
  { id: "banks", label: "Banks", icon: "🏦" },
  { id: "petrol", label: "Petrol", icon: "⛽" },
  { id: "shopping", label: "Shopping", icon: "🛍️" },
  { id: "parks", label: "Parks", icon: "🌳" },
  { id: "pharmacies", label: "Pharmacies", icon: "💊" },
  { id: "police", label: "Police", icon: "🚓" },
  { id: "publicTransport", label: "Transit", icon: "🚌" },
];

export function NearbyPanel() {
  const [category, setCategory] = useState<NearbyCategory>("restaurants");
  const location = useLocationStore((s) => s.selectedLocation);
  const units = useUiStore((s) => s.units);

  const query = useQuery({
    queryKey: ["nearby", location?.lat, location?.lon, category],
    queryFn: ({ signal }) => fetchNearby(location!.lat, location!.lon, 1500, category, signal),
    enabled: !!location,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="nearby-panel">
      <h2>Nearby</h2>
      <div className="nearby-panel__categories" role="tablist" aria-label="Nearby category">
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={category === c.id} className={category === c.id ? "active" : ""} onClick={() => setCategory(c.id)}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      <AsyncPanel query={query} label="Nearby places" isEmpty={(items) => items.length === 0} idleMessage="Select a location to see nearby places.">
        {(items) => (
          <ul className="nearby-panel__list">
            {items.slice(0, 20).map((item) => (
              <li key={item.id}>
                <span>{item.name}</span>
                <strong>{formatDistance(item.distanceMeters, units)}</strong>
              </li>
            ))}
          </ul>
        )}
      </AsyncPanel>
      <p className="nearby-panel__source">Source: OpenStreetMap / Overpass, within 1.5km</p>
    </div>
  );
}
