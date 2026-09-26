import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchWeather } from "@/services/intel";
import { useLocationStore } from "@/stores/locationStore";
import "./LocationIdentityPanel.css";
import { track } from "@/services/analytics";
import { useMapStore } from "@/stores/mapStore";
import { useShellStore } from "@/stores/shellStore";
import { useIntelTabStore } from "@/stores/intelTabStore";
import { useUiStore } from "@/stores/uiStore";
import { buildShareUrl as shareUrl } from "@/features/share/viewState";
import { samePoint, useSavedPlacesStore } from "@/stores/savedPlacesStore";

function formatCoord(value: number): string {
  return value.toFixed(6);
}

export function LocationIdentityPanel() {
  const location = useLocationStore((s) => s.selectedLocation);
  const [copied, setCopied] = useState(false);
  const [linkState, setLinkState] = useState<"idle" | "copied" | "failed">("idle");
  const [saveFull, setSaveFull] = useState(false);
  const saved = useSavedPlacesStore((s) => (location ? s.saved.some((p) => samePoint(p, location)) : false));
  const savePlace = useSavedPlacesStore((s) => s.save);
  const removePlace = useSavedPlacesStore((s) => s.remove);

  /*
    The timezone of the PLACE, which only Open-Meteo knows.

    Same query key and options as every other weather caller, so TanStack
    serves it from the one cached response rather than making a second
    request for one string.
  */
  const weather = useQuery({
    queryKey: ["weather", location?.lat, location?.lon],
    queryFn: ({ signal }) => fetchWeather(location!.lat, location!.lon, signal),
    enabled: !!location,
    staleTime: 10 * 60 * 1000,
  });

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
      track("result_link_copied", { surface: "location-identity" });
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context) - non-fatal.
    }
  };

  const handleShare = async () => {
    const shareData = { title: location.name, text: location.displayName, url: buildShareUrl(location) };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        // Fired after the sheet resolves, not before it opens: a share that
        // the person cancelled is not a share, and counting it would quietly
        // inflate the one number this product's growth actually depends on.
        track("result_shared", { surface: "location-identity", method: "native" });
      } catch {
        // User cancelled the native share sheet - not an error.
      }
    } else {
      /*
        No share sheet (Firefox, most Linux browsers, older desktops): copy
        the LINK. This used to fall through to handleCopy, which copies the
        coordinates, so the button said "Copied" while the clipboard held
        "17.44, 78.35" and the recipient got nothing they could open.
      */
      try {
        await navigator.clipboard.writeText(shareData.url);
        track("result_shared", { surface: "location-identity", method: "clipboard" });
        setLinkState("copied");
      } catch {
        // Clipboard blocked (permissions, insecure context). Say so rather
        // than pretend, and leave the link visible in the address bar path.
        setLinkState("failed");
      }
      setTimeout(() => setLinkState("idle"), 2000);
    }
  };

  const rows: Array<[string, string | undefined]> = [
    ["City", location.address.city],
    ["District", location.address.district],
    ["State", location.address.state],
    ["Country", location.address.country],
    ["Postal code", location.address.postcode],
    /*
      Three honest states and no fourth. A real IANA zone for this point, a
      plain "Loading" while the one shared weather request is in flight, or
      "Unavailable" when the provider did not return one. What it must never
      show again is the reader's own timezone, which is what stood here and
      read exactly like a fact about the place.
    */
    [
      "Timezone",
      weather.data?.timezone ??
        (weather.isLoading ? "Loading…" : weather.isError ? "Unavailable" : undefined),
    ],
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
        <button
          type="button"
          aria-pressed={saved}
          onClick={() => {
            if (saved) {
              removePlace(location);
              setSaveFull(false);
            } else {
              setSaveFull(!savePlace(location));
            }
          }}
          title="Saved in this browser only. There are no accounts, so it does not follow you to other devices."
        >
          {saved ? "★ Saved" : saveFull ? "List full: remove one first" : "☆ Save place"}
        </button>
        <button type="button" onClick={handleCopy}>
          {copied ? "✓ Copied" : "📋 Copy coordinates"}
        </button>
        <button type="button" onClick={handleShare} aria-live="polite">
          {linkState === "copied" ? "✓ Link copied" : linkState === "failed" ? "Couldn't copy the link" : "🔗 Share"}
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

/**
 * The link this button produces.
 *
 * It used to be `?lat=..&lon=..` - a pin, and nothing else. So sharing a result
 * sent the coordinates the result came from rather than the result: the person
 * opening it got the default map at the default zoom with no radius and no
 * panel, and had to rebuild the interesting part themselves. Mostly they would
 * not bother, and the whole reason to share was gone.
 *
 * It now reads the live state out of the stores at the moment the button is
 * pressed, so the link carries the view. Defaults are passed in and omitted
 * from the query string, which keeps a plain place share short.
 *
 * See features/share/viewState.ts for the format.
 */
function buildShareUrl(location: { lat: number; lon: number }): string {
  const map = useMapStore.getState();
  const { radiusMeters } = useLocationStore.getState();
  const { section, open } = useShellStore.getState();
  const { tab } = useIntelTabStore.getState();
  const defaultRadius = useUiStore.getState().defaultRadiusMeters;

  return shareUrl(
    {
      lat: location.lat,
      lon: location.lon,
      zoom: map.zoom,
      basemap: map.basemap,
      radiusMeters,
      // A closed panel is a deliberate state, and reopening it for the
      // recipient would be putting them somewhere the sender was not.
      section: open ? section : undefined,
      tab: open && section === "place" ? tab : undefined,
    },
    { zoom: 12, radiusMeters: defaultRadius }
  );
}
