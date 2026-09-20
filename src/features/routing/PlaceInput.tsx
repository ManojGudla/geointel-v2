import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchLocations } from "@/services/geocode";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMapStore } from "@/stores/mapStore";
import { parseCoordinatePair } from "@/features/search/coordinateSearch";
import type { SearchSuggestion } from "@/types/location";
import "./PlaceInput.css";

interface PlaceInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: SearchSuggestion) => void;
  placeholder?: string;
  /** True once this field has been resolved to real coordinates. */
  resolved: boolean;
}

/**
 * The From/To field.
 *
 * The bug this rewrite exists to fix: the old version only ever set a point
 * when you CLICKED a dropdown row with the mouse. Type the full name and
 * press Enter - the thing everyone does - and nothing happened at all. The
 * text sat in the box, the route never ran, and the panel showed no error,
 * because as far as the app was concerned you hadn't chosen anywhere. That's
 * why directions looked broken with both fields apparently filled in.
 *
 * Now: arrow keys move through the list, Enter takes the highlighted row (or
 * the first one if you haven't moved), Escape closes it, and leaving the
 * field with unresolved text resolves the best match rather than silently
 * discarding what you typed. Pasted coordinates work too. The field also SAYS
 * whether it has a real place yet, so "why is nothing happening" is never a
 * question you have to ask.
 */
export function PlaceInput({ label, value, onChange, onSelect, placeholder, resolved }: PlaceInputProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
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
  const debounced = useDebouncedValue(value, 600);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | null>(null);
  const center = useMapStore((s) => s.center);

  const coordinates = parseCoordinatePair(value);

  const query = useQuery({
    // Includes the map centre so "Gandhi Nagar" resolves to the one near the
    // route being planned rather than the most famous one in the country.
    queryKey: ["geocode", "route", debounced, center[0].toFixed(1), center[1].toFixed(1)],
    queryFn: ({ signal }) => searchLocations(debounced, signal, { lat: center[1], lon: center[0] }),
    enabled: debounced.trim().length >= 3 && !coordinates,
    staleTime: 30_000,
  });

  const suggestions = query.data ?? [];

  useEffect(() => {
    setHighlighted(-1);
  }, [debounced]);

  useEffect(() => () => { if (blurTimer.current) window.clearTimeout(blurTimer.current); }, []);

  const choose = (s: SearchSuggestion) => {
    onChange(s.displayName);
    setOpen(false);
    setHighlighted(-1);
    onSelect(s);
    inputRef.current?.blur();
  };

  /** Pasted "17.385, 78.486" is a location too - no lookup needed. */
  const chooseCoordinates = () => {
    if (!coordinates) return;
    const label = `${coordinates.lat.toFixed(5)}, ${coordinates.lon.toFixed(5)}`;
    choose({ lat: coordinates.lat, lon: coordinates.lon, displayName: label, name: label });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (coordinates) {
        chooseCoordinates();
        return;
      }
      // -1 means "nothing highlighted", in which case Enter takes the top
      // result - what every search box does, and what people expect.
      const pick = suggestions[highlighted >= 0 ? highlighted : 0];
      if (pick) choose(pick);
    }
  };

  /**
   * Leaving the field with typed-but-unresolved text resolves the best match
   * instead of throwing it away. Delayed so a click on a suggestion lands
   * first - otherwise blur would fire before the click and resolve the wrong
   * row.
   */
  const onBlur = () => {
    blurTimer.current = window.setTimeout(() => {
      setOpen(false);
      if (resolved || !value.trim()) return;
      if (coordinates) {
        chooseCoordinates();
        return;
      }
      const pick = suggestions[0];
      if (pick) onSelect(pick);
    }, 160);
  };

  const showHint = !resolved && value.trim().length >= 2 && !query.isFetching;

  return (
    <div className="place-input">
      <label>{label}</label>
      <div className={`place-input__box${resolved ? " place-input__box--resolved" : ""}`}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-autocomplete="list"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        {resolved && (
          <span className="place-input__check" aria-label="Location set">
            ✓
          </span>
        )}
        {query.isFetching && !resolved && <span className="place-input__spinner" aria-hidden="true" />}
      </div>

      {showHint && (
        <p className="place-input__hint">
          {coordinates
            ? "Press Enter to use these coordinates"
            : suggestions.length > 0
              ? "Pick one below, or press Enter for the first"
              : query.isError
                ? "Search is unavailable right now."
                : "No matching place found."}
        </p>
      )}

      {open && (suggestions.length > 0 || coordinates) && (
        <ul className="place-input__suggestions" role="listbox">
          {coordinates && (
            <li>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={chooseCoordinates}>
                📌 Go to {coordinates.lat.toFixed(5)}, {coordinates.lon.toFixed(5)}
              </button>
            </li>
          )}
          {suggestions.slice(0, 6).map((s, i) => (
            <li key={`${s.displayName}-${s.lat}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlighted}
                className={i === highlighted ? "highlighted" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => choose(s)}
              >
                {s.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
