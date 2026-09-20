import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchLocations, reverseGeocode } from "@/services/geocode";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useSearchStore } from "@/stores/searchStore";
import { useLocationStore } from "@/stores/locationStore";
import { parseCoordinatePair, formatCoordinateLabel, type CoordinatePair } from "./coordinateSearch";
import { useMapStore } from "@/stores/mapStore";
import { useShellStore } from "@/stores/shellStore";
import { parseMapCommand } from "@/features/ai/mapCommands";
import { useRunAnalysis } from "@/features/analysis/useRunAnalysis";
import type { AnalysisRequest } from "@/features/analysis/runAnalysis";
import type { SearchSuggestion } from "@/types/location";
import "./SearchBar.css";
import { track } from "@/services/analytics";

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
    // Reverse geocode enrichment failed - still show what the search result gave us.
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
  const [asking, setAsking] = useState(false);
  // Which suggestion the arrow keys have moved to. -1 means "none highlighted",
  // in which case Enter falls back to the first result - the behaviour people
  // expect from every other search box.
  const [highlighted, setHighlighted] = useState(-1);
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const addRecentSearch = useSearchStore((s) => s.addRecentSearch);
  const recentSearches = useSearchStore((s) => s.recentSearches);
  const clearRecentSearches = useSearchStore((s) => s.clearRecentSearches);
  const setSelectedLocation = useLocationStore((s) => s.setSelectedLocation);

  /**
 * 600ms and three characters, not 300ms and two.
 *
 * Every keystroke past the debounce is a live Nominatim search, and their
 * usage policy asks people not to build as-you-type autocomplete against it
 * at all. Proxying through our own endpoint satisfies the letter of the
 * clause and reproduces exactly the request pattern it exists to prevent. At
 * 300ms/2 chars, typing "hyderabad" fired several searches; at 600ms/3 it
 * fires roughly one, and the extra 300ms is below the threshold where a
 * search box feels slow.
 */
  const debouncedQuery = useDebouncedValue(query, 600);
  const geolocation = useGeolocation();
  const selectedLocation = useLocationStore((s) => s.selectedLocation);
  const mapCenter = useMapStore((s) => s.center);
  const openSection = useShellStore((s) => s.openSection);
  const runAnalysis = useRunAnalysis();

  /**
   * One box, two jobs. "Charminar" is a place lookup; "hospitals within 5 km"
   * is a spatial question, and making the user know which box each belongs
   * in is exactly the kind of "learn the software first" tax this product is
   * trying to remove. The parser decides, and the dropdown says out loud
   * which reading it took before anything happens.
   */
  const spatialCommand = useMemo(() => parseMapCommand(debouncedQuery), [debouncedQuery]);

  // A well-formed coordinate pair IS the location - no need to round-trip it
  // through Nominatim's free-text search (which doesn't reliably resolve a
  // bare coordinate string anyway). See coordinateSearch.ts.
  const coordinateMatch = useMemo(() => parseCoordinatePair(debouncedQuery), [debouncedQuery]);

  const suggestionsQuery = useQuery({
    // The map centre is part of the key AND the request: the same word means
    // different places depending on where you are looking, and the API ranks
    // by proximity so that a local neighbourhood beats a distant famous city.
    queryKey: ["geocode", debouncedQuery, mapCenter[0].toFixed(1), mapCenter[1].toFixed(1)],
    queryFn: ({ signal }) => searchLocations(debouncedQuery, signal, { lat: mapCenter[1], lon: mapCenter[0] }),
    enabled: debouncedQuery.trim().length >= 3 && !coordinateMatch,
    staleTime: 30_000,
  });

  const suggestions = useMemo<SearchSuggestion[]>(() => {
    if (coordinateMatch) {
      return [
        {
          lat: coordinateMatch.lat,
          lon: coordinateMatch.lon,
          name: "Coordinates",
          displayName: `📍 Go to ${formatCoordinateLabel(coordinateMatch)}`,
        },
      ];
    }
    return suggestionsQuery.data ?? [];
  }, [coordinateMatch, suggestionsQuery.data]);

  // Any change to the result set invalidates a highlight pointing into the old one.
  useEffect(() => setHighlighted(-1), [suggestions]);

  const goToCoordinates = (pair: CoordinatePair) => {
    const label = formatCoordinateLabel(pair);
    setQuery(label);
    setOpen(false);
    setHighlighted(-1);
    void selectSuggestion({ lat: pair.lat, lon: pair.lon, name: "Coordinates", displayName: label }, setSelectedLocation, addRecentSearch);
  };

  /**
   * Runs a spatial question typed into the search box.
   *
   * Origin falls back to the map centre when nothing is selected, so "ask
   * the map anything" works from the very first screen rather than
   * demanding a location be picked first. The dropdown states which origin
   * it will use before you commit, so the fallback is never a surprise.
   */
  const askTheMap = async () => {
    const command = parseMapCommand(query) ?? spatialCommand;
    if (!command) return;

    const origin = selectedLocation
      ? { lat: selectedLocation.lat, lon: selectedLocation.lon }
      : { lat: mapCenter[1], lon: mapCenter[0] };

    setOpen(false);
    setHighlighted(-1);
    setAsking(true);

    const request: AnalysisRequest =
      command.operation === "suitability"
        ? { operation: "suitability", origin, presetId: command.presetId, radiusMeters: command.radiusMeters }
        : command.operation === "nearest"
          ? { operation: "nearest", origin, category: command.category, radiusMeters: 10_000 }
          : command.operation === "buffer"
            ? { operation: "buffer", origin, radiusMeters: command.radiusMeters }
            : { operation: "within", origin, category: command.category, radiusMeters: command.radiusMeters };

    // The answer renders in Analyze, so that is where the user is taken -
    // an analysis that runs with its result off-screen reads as nothing
    // having happened.
    openSection("tools");
    await runAnalysis(request).catch(() => undefined);
    setAsking(false);
  };

  const choose = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.displayName);
    setOpen(false);
    setHighlighted(-1);
    void selectSuggestion(suggestion, setSelectedLocation, addRecentSearch);
  };

  /**
   * Pasting a coordinate goes straight there.
   *
   * Reported friction: after pasting coordinates you still had to notice a
   * dropdown had appeared and click the one row in it - an extra step with
   * no decision in it, since a well-formed pair is unambiguous. A paste is a
   * complete, deliberate input in a way that typing is not, so it can be
   * acted on immediately; typing the same characters still shows the
   * suggestion, because someone mid-way through "17.38, 78.4" hasn't
   * finished saying what they mean yet.
   *
   * The flag is set here and consumed by the change handler because paste
   * fires BEFORE the input's value updates - reading the value here would
   * read the text as it was a keystroke ago.
   */
  const pasteJustHappened = useRef(false);

  const handleChange = (value: string) => {
    setQuery(value);
    setOpen(true);
    if (!pasteJustHappened.current) return;
    pasteJustHappened.current = false;
    const pair = parseCoordinatePair(value);
    if (pair) goToCoordinates(pair);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!suggestions.length) return;
      event.preventDefault();
      setOpen(true);
      setHighlighted((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        if (next < 0) return suggestions.length - 1;
        if (next >= suggestions.length) return 0;
        return next;
      });
      return;
    }

    if (event.key !== "Enter") return;
    event.preventDefault();

    // Enter on a coordinate doesn't wait for the 300ms debounce - the raw
    // value is parsed directly, so pressing Enter the instant you finish
    // typing works rather than silently doing nothing.
    const pair = parseCoordinatePair(query);
    if (pair) {
      goToCoordinates(pair);
      return;
    }

    // A recognised spatial question takes precedence over place results:
    // Nominatim will happily return something for "hospitals within 5 km",
    // and picking that would answer a question nobody asked.
    if (parseMapCommand(query)) {
      // Length, never the text. A search string is free-form and routinely
      // contains a home address; its length is enough to tell a typo from a
      // real question.
      track("search_started", { kind: "question", queryLength: query.length });
      void askTheMap();
      return;
    }

    const target = suggestions[highlighted] ?? suggestions[0];
    if (target) {
      track("search_started", { kind: "place", queryLength: query.length, resultCount: suggestions.length });
      choose(target);
    } else {
      // A submitted search with nothing to choose is a failed search, and this
      // is the event that turns "people are not finding things" from a hunch
      // into a list of queries to fix.
      track("search_failed", { kind: "place", queryLength: query.length });
    }
  };

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
          {/* The placeholder is short enough to fit a phone. The long version
              - "Search a place, or type what you want to find…" - was clipped
              mid-word at 390px, which made the one input that explains this
              product look broken. The getting-started card underneath carries
              the full sentence. */}
          <input
            type="text"
            className="search-bar__input"
            placeholder="Search a place or a question…"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onPaste={() => {
              pasteJustHappened.current = true;
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            aria-label="Search a location"
            aria-expanded={open && suggestions.length > 0}
            aria-activedescendant={highlighted >= 0 ? `search-suggestion-${highlighted}` : undefined}
            role="combobox"
            aria-autocomplete="list"
            aria-controls="search-suggestion-list"
          />
          {suggestionsQuery.isFetching && <span className="search-bar__spinner" aria-hidden="true" />}
        </div>

        <button
          type="button"
          className="search-bar__locate"
          onClick={handleUseMyLocation}
          disabled={geolocation.status === "locating"}
          aria-label={geolocation.status === "locating" ? "Locating you" : "Use my location"}
          title="Use my location"
        >
          <span aria-hidden="true">📍</span>
          {/* Label drops away on a phone, where it was squeezing the search
              field itself down to a couple of visible words. */}
          <span className="search-bar__locate-label">{geolocation.status === "locating" ? "Locating…" : "Use My Location"}</span>
        </button>
      </div>

      {geolocation.error && <p className="search-bar__error">{geolocation.error}</p>}

      {/* Shown above place results, visually distinct, and labelled - so the
          two readings of one box are never ambiguous. */}
      {open && spatialCommand && !coordinateMatch && (
        <button type="button" className="search-bar__ask" onMouseDown={(e) => e.preventDefault()} onClick={() => void askTheMap()} disabled={asking}>
          {/* "Find on map", not "Ask the map". The chat assistant is called
              "Ask maNOWj", and two features whose names both start with "Ask"
              are two features nobody can tell apart. This one finds things and
              draws them; that one answers in words. The verb is the tell. */}
          <span className="search-bar__ask-badge">Find on map</span>
          <span className="search-bar__ask-text">
            <strong>{query}</strong>
            <span>
              {asking ? "Running the analysis…" : selectedLocation ? `Analysed around ${selectedLocation.name}` : "Analysed around the current map centre"}
            </span>
          </span>
          <span className="search-bar__ask-enter" aria-hidden="true">
            ↵
          </span>
        </button>
      )}

      {/*
        Recent places, shown when the box is focused and still empty.

        These were already being written to the browser on every single
        search - the store has persisted them since the day it was written -
        and nothing anywhere in this application ever read them back. That is
        the worst of both outcomes: a returning visitor got no benefit
        whatsoever from it, and their search history quietly accumulated in
        storage with no way to see it and no way to clear it, on a site that
        asks permission before it counts a page view.

        So it is shown, and it can be cleared. Either one alone would have
        been half a fix: displaying a history nobody can delete is worse than
        not keeping one, and deleting a history nobody can see fixes a
        problem the user never knew they had.

        Not a `role="listbox"`: the combobox above points `aria-controls` at
        the results list, and a second listbox claiming the same relationship
        gives a screen reader two answers to one question. These are plain
        buttons, which is what they are.
      */}
      {open && query.trim().length === 0 && recentSearches.length > 0 && (
        <div className="search-bar__recent">
          <div className="search-bar__recent-head">
            <span className="search-bar__recent-title">Recent</span>
            <button
              type="button"
              className="search-bar__recent-clear"
              /* preventDefault on mousedown, or the input's blur closes this
                 before the click ever lands. */
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearRecentSearches}
            >
              Clear
            </button>
          </div>
          <ul className="search-bar__suggestions" aria-label="Recent searches">
            {recentSearches.map((s) => (
              <li key={`recent-${s.displayName}-${s.lat}-${s.lon}`}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s)}>
                  <strong>{s.name}</strong>
                  <span>{s.displayName}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && suggestions.length > 0 && (
        <ul className="search-bar__suggestions" role="listbox" id="search-suggestion-list">
          {suggestions.map((s, index) => (
            <li key={`${s.displayName}-${s.lat}-${s.lon}`}>
              <button
                type="button"
                id={`search-suggestion-${index}`}
                role="option"
                aria-selected={index === highlighted}
                className={index === highlighted ? "search-bar__suggestion--active" : undefined}
                onMouseEnter={() => setHighlighted(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
              >
                <strong>{s.name}</strong>
                <span>{s.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        Nothing found. This used to render NOTHING AT ALL - no dropdown, no
        message, no spinner, just a box that had stopped doing anything. To a
        user that is indistinguishable from broken software, which is exactly
        how it kept being reported: "it is not showing".

        The honest part matters here. This map is built on OpenStreetMap, and
        individual houses and flats in India are frequently not mapped in it.
        No wording makes that address appear. So rather than a bare "no
        results", this says what to try instead, and offers the one thing that
        always works: put the pin on the map yourself.
      */}
      {open && !suggestionsQuery.isFetching && !suggestionsQuery.isError && debouncedQuery.trim().length >= 2 && suggestions.length === 0 && (
        <div className="search-bar__empty" role="status">
          <p className="search-bar__empty-head">
            Nothing found for <strong>{debouncedQuery.trim()}</strong>
          </p>
          <ul>
            <li>Try just the area or colony name, without the house number.</li>
            <li>A Plus Code works too. Paste it exactly as Google shows it.</li>
            <li>
              Or <button type="button" className="search-bar__empty-link" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)}>close this and click the spot on the map</button>.
            </li>
          </ul>
          <p className="search-bar__empty-note">
            Addresses here come from OpenStreetMap, which does not have every house in it yet.
          </p>
        </div>
      )}

      {open && debouncedQuery.trim().length >= 2 && suggestionsQuery.isError && (
        <div className="search-bar__suggestions search-bar__suggestions--error">Search is temporarily unavailable. Please try again.</div>
      )}
    </div>
  );
}
