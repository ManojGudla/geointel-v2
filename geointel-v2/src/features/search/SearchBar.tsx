import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchLocations, reverseGeocode } from "@/services/geocode";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useSearchStore } from "@/stores/searchStore";
import { useLocationStore } from "@/stores/locationStore";
import type { SearchSuggestion } from "@/types/location";
import "./SearchBar.css";

async function selectSuggestion(
  suggestion: SearchSuggestion,
  setSelectedLocation: ReturnType<typeof useLocationStore.getState>["setSelectedLocation"],
  addRecentSearch: ReturnType<typeof useSearchStore.getState>["addRecentSearch"]
) {
  addRecentSearch(suggestion);
  try {
    const location = await reverseGeocode(suggestion.lat, suggestion.lon);
    setSelectedLocation(location);
  } catch {
    // Reverse geocode enrichment failed — still show what the search result gave us.
    setSelectedLocation({
      lat: suggestion.lat,
      lon: suggestion.lon,
      displayName: suggestion.displayName,
      name: suggestion.name,
      address: {},
      source: "OpenStreetMap / Nominatim",
    });
  }
}

export function SearchBar() {
  const [open, setOpen] = useState(false);
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const addRecentSearch = useSearchStore((s) => s.addRecentSearch);
  const setSelectedLocation = useLocationStore((s) => s.setSelectedLocation);

  const debouncedQuery = useDebouncedValue(query, 300);
  const geolocation = useGeolocation();

  const suggestionsQuery = useQuery({
    queryKey: ["geocode", debouncedQuery],
    queryFn: ({ signal }) => searchLocations(debouncedQuery, signal),
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 30_000,
  });

  const suggestions = useMemo(() => suggestionsQuery.data ?? [], [suggestionsQuery.data]);

  const handleUseMyLocation = () => geolocation.locate();

  // Once we have live coordinates, resolve them into a full Location and select it.
  useEffect(() => {
    if (geolocation.status !== "granted" || !geolocation.coords) return;
    let cancelled = false;
    const { lat, lon } = geolocation.coords;

    reverseGeocode(lat, lon)
      .then((location) => {
        if (cancelled) return;
        setSelectedLocation({ ...location, name: "My Location" });
        setQuery(location.displayName);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedLocation({ lat, lon, displayName: "My Location", name: "My Location", address: {}, source: "Browser Geolocation" });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geolocation.status]);

  return (
    <div className="search-bar">
      <div className="search-bar__row">
        <div className="search-bar__input-wrap">
          <input
            type="text"
            className="search-bar__input"
            placeholder="Search a place, address, landmark, business or postcode..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            aria-label="Search a location"
            aria-expanded={open && suggestions.length > 0}
            role="combobox"
            aria-autocomplete="list"
          />
          {suggestionsQuery.isFetching && <span className="search-bar__spinner" aria-hidden="true" />}
        </div>

        <button type="button" className="search-bar__locate" onClick={handleUseMyLocation} disabled={geolocation.status === "locating"}>
          📍 {geolocation.status === "locating" ? "Locating…" : "Use My Location"}
        </button>
      </div>

      {geolocation.error && <p className="search-bar__error">{geolocation.error}</p>}

      {open && suggestions.length > 0 && (
        <ul className="search-bar__suggestions" role="listbox">
          {suggestions.map((s) => (
            <li key={`${s.displayName}-${s.lat}-${s.lon}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery(s.displayName);
                  setOpen(false);
                  void selectSuggestion(s, setSelectedLocation, addRecentSearch);
                }}
              >
                <strong>{s.name}</strong>
                <span>{s.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && debouncedQuery.trim().length >= 2 && suggestionsQuery.isError && (
        <div className="search-bar__suggestions search-bar__suggestions--error">Search is temporarily unavailable. Please try again.</div>
      )}
    </div>
  );
}
