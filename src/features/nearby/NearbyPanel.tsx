import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AsyncPanel } from "@/components/AsyncPanel";
import { fetchNearbyResult } from "@/services/intel";
import { formatDistance } from "@/features/map/geo";
import { useLocationStore } from "@/stores/locationStore";
import { useRouteStore } from "@/stores/routeStore";
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
  const setFrom = useRouteStore((s) => s.setFrom);
  const openDirections = useRouteStore((s) => s.openPanel);

  /*
    A list of places with distances and nothing to click was a dead end: it
    told you Domino's is 98m away and then left you to type "Domino's" into
    the Directions panel yourself. The distance is the promise that the app
    knows where this is, so the row has to be able to act on it.

    `from` is set to the place currently being explored rather than the
    user's GPS position, because the distances in this list are measured
    from that point. A route starting somewhere else would contradict the
    number printed beside it.
  */
  const directionsTo = (place: { name: string; lat: number; lon: number }) => {
    if (location) setFrom(location);
    openDirections({ lat: place.lat, lon: place.lon, name: place.name, displayName: place.name });
  };

  const query = useQuery({
    queryKey: ["nearby", location?.lat, location?.lon, category],
    queryFn: ({ signal }) => fetchNearbyResult(location!.lat, location!.lon, 1500, category, signal),
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

      <AsyncPanel
        query={query}
        label="Nearby places"
        isEmpty={(result) => result.items.length === 0}
        idleMessage="Select a location to see nearby places."
      >
        {(result) => (
          <>
            {/*
              Say it, rather than quietly answering a different question.
              Where OpenStreetMap coverage is thin the server widens the
              search once instead of returning nothing, and a reader who
              asked about 1.5km deserves to know these results are from 5.
            */}
            {result.widened && (
              <p className="nearby-panel__widened">
                Nothing was mapped within {(result.requestedRadiusMeters / 1000).toFixed(1)} km, so this searched{" "}
                {(result.radiusMeters / 1000).toFixed(0)} km instead.
              </p>
            )}
          <ul className="nearby-panel__list">
            {result.items.slice(0, 20).map((item) => (
              <li key={item.id}>
                {/* The whole row is the target, not a small icon beside it:
                    these are read and tapped on a phone. */}
                <button type="button" onClick={() => directionsTo(item)} aria-label={`Directions to ${item.name}`}>
                  <span className="nearby-panel__name">{item.name}</span>
                  <strong>{formatDistance(item.distanceMeters, units)}</strong>
                  <span className="nearby-panel__go" aria-hidden="true">
                    Directions
                  </span>
                </button>
              </li>
            ))}
          </ul>
          </>
        )}
      </AsyncPanel>
      {/* The radius here used to be hard-coded at 1.5km, which stopped being
          true the moment the server learned to widen the search. It now
          reports whatever was actually searched. */}
      <p className="nearby-panel__source">
        Source: OpenStreetMap / Overpass, within {((query.data?.radiusMeters ?? 1500) / 1000).toFixed(1)} km
      </p>
    </div>
  );
}
