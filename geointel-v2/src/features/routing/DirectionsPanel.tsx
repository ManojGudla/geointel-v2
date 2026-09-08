import { useEffect, useState } from "react";
import { AsyncPanel } from "@/components/AsyncPanel";
import { PlaceInput } from "./PlaceInput";
import { useRoute } from "./useRoute";
import { formatDistance } from "@/features/map/geo";
import { useRouteStore, type RoutePoint } from "@/stores/routeStore";
import { useGeolocation } from "@/hooks/useGeolocation";
import { reverseGeocode } from "@/services/geocode";
import { useUiStore } from "@/stores/uiStore";
import type { RouteMode } from "@/types/intel";
import "./DirectionsPanel.css";

const MODES: Array<{ id: RouteMode; label: string; icon: string }> = [
  { id: "car", label: "Car", icon: "🚗" },
  { id: "walk", label: "Walk", icon: "🚶" },
  { id: "bike", label: "Bike", icon: "🏍️" },
];

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function bookingLinks(from: RoutePoint | null, to: RoutePoint | null) {
  const dest = to ? `${to.lat},${to.lon}` : "";
  const origin = from ? `${from.lat},${from.lon}` : "";
  return [
    { label: "Uber", url: `https://m.uber.com/looking?pickup=${origin || "my_location"}&drop[0]=${dest}` },
    { label: "Rapido", url: "https://www.rapido.bike/" },
    { label: "Ola", url: "https://www.olacabs.com/" },
    { label: "Google Maps", url: to ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}` : "https://maps.google.com" },
  ];
}

export function DirectionsPanel() {
  const { from, to, mode, isPanelOpen, setFrom, setTo, setMode, closePanel } = useRouteStore();
  const [fromText, setFromText] = useState(from?.displayName ?? "");
  const [toText, setToText] = useState(to?.displayName ?? "");
  const geolocation = useGeolocation();
  const units = useUiStore((s) => s.units);

  const query = useRoute();

  const handleUseCurrentLocation = () => {
    geolocation.locate();
  };

  // Once "Use My Current Location" resolves coordinates, reverse-geocode
  // them into a real address and set it as the From point.
  useEffect(() => {
    if (geolocation.status !== "granted" || !geolocation.coords) return;
    let cancelled = false;
    const { lat, lon } = geolocation.coords;

    reverseGeocode(lat, lon)
      .then((loc) => {
        if (cancelled) return;
        setFrom(loc);
        setFromText(loc.displayName);
      })
      .catch(() => {
        if (cancelled) return;
        const point = { lat, lon, displayName: "My Location", name: "My Location" };
        setFrom(point);
        setFromText(point.displayName);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geolocation.status]);

  if (!isPanelOpen) return null;

  return (
    <div className="directions-panel">
      <div className="directions-panel__head">
        <h2>Plan Your Journey</h2>
        <button type="button" onClick={closePanel} aria-label="Close directions">
          ✕
        </button>
      </div>

      <PlaceInput
        label="From"
        value={fromText}
        onChange={setFromText}
        onSelect={(s) => {
          setFrom({ lat: s.lat, lon: s.lon, displayName: s.displayName, name: s.name });
          setFromText(s.displayName);
        }}
        placeholder="Starting point"
      />
      <button type="button" className="directions-panel__locate" onClick={handleUseCurrentLocation}>
        📍 Use My Current Location as From
      </button>
      {geolocation.error && <p className="directions-panel__error">{geolocation.error}</p>}

      <PlaceInput
        label="To"
        value={toText}
        onChange={setToText}
        onSelect={(s) => {
          setTo({ lat: s.lat, lon: s.lon, displayName: s.displayName, name: s.name });
          setToText(s.displayName);
        }}
        placeholder="Destination"
      />

      <div className="directions-panel__modes" role="group" aria-label="Travel mode">
        {MODES.map((m) => (
          <button key={m.id} type="button" className={mode === m.id ? "active" : ""} onClick={() => setMode(m.id)}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {from && to && (
        <AsyncPanel query={query} label="Route" idleMessage="">
          {(route) => (
            <>
              <div className="directions-panel__result">
                <div>
                  <span>Distance</span>
                  <strong>{formatDistance(route.distanceMeters, units)}</strong>
                </div>
                <div>
                  <span>Duration</span>
                  <strong>{formatDuration(route.durationSeconds)}</strong>
                </div>
                {route.alternatives > 0 && (
                  <div>
                    <span>Alternatives</span>
                    <strong>{route.alternatives}</strong>
                  </div>
                )}
              </div>
              <p className="directions-panel__source">Source: {route.source}</p>

              <div className="directions-panel__booking">
                <strong>Book a ride from this route</strong>
                <div className="directions-panel__booking-links">
                  {bookingLinks(from, to).map((link) => (
                    <a key={link.label} href={link.url} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  ))}
                </div>
                <small>These open the provider's official app or site — GeoIntel doesn't process bookings itself.</small>
              </div>
            </>
          )}
        </AsyncPanel>
      )}
    </div>
  );
}
