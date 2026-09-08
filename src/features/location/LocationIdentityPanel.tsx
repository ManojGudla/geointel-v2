import { useState } from "react";
import { useLocationStore } from "@/stores/locationStore";
import "./LocationIdentityPanel.css";

function formatCoord(value: number): string {
  return value.toFixed(6);
}

export function LocationIdentityPanel() {
  const location = useLocationStore((s) => s.selectedLocation);
  const [copied, setCopied] = useState(false);

  if (!location) {
    return (
      <div className="location-panel location-panel--empty">
        <h2>Location Identity</h2>
        <p>Search a place or use your current location to see details here.</p>
      </div>
    );
  }

  const coordsText = `${formatCoord(location.lat)}, ${formatCoord(location.lon)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(coordsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context) — non-fatal.
    }
  };

  const handleShare = async () => {
    const shareData = { title: location.name, text: location.displayName, url: buildShareUrl(location) };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled the native share sheet — not an error.
      }
    } else {
      await handleCopy();
    }
  };

  const rows: Array<[string, string | undefined]> = [
    ["City", location.address.city],
    ["District", location.address.district],
    ["State", location.address.state],
    ["Country", location.address.country],
    ["Postal code", location.address.postcode],
    ["Timezone", location.timezone],
  ];

  return (
    <div className="location-panel">
      <h2>📍 {location.name}</h2>
      <p className="location-panel__address">{location.displayName}</p>

      <dl className="location-panel__grid">
        <div className="location-panel__row location-panel__row--wide">
          <dt>Coordinates</dt>
          <dd>{coordsText}</dd>
        </div>
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div className="location-panel__row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>

      <div className="location-panel__actions">
        <button type="button" onClick={handleCopy}>
          {copied ? "✓ Copied" : "📋 Copy coordinates"}
        </button>
        <button type="button" onClick={handleShare}>
          🔗 Share
        </button>
        <a href={`https://www.google.com/maps?q=${location.lat},${location.lon}`} target="_blank" rel="noreferrer">
          🗺️ Google Maps
        </a>
        <a href={`https://maps.apple.com/?ll=${location.lat},${location.lon}`} target="_blank" rel="noreferrer">
          🍎 Apple Maps
        </a>
      </div>

      <p className="location-panel__source">Source: {location.source}</p>
    </div>
  );
}

function buildShareUrl(location: { lat: number; lon: number }): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/?lat=${location.lat}&lon=${location.lon}`;
}
