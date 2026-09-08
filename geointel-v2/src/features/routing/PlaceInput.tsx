import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchLocations } from "@/services/geocode";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { SearchSuggestion } from "@/types/location";
import "./PlaceInput.css";

interface PlaceInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: SearchSuggestion) => void;
  placeholder?: string;
}

export function PlaceInput({ label, value, onChange, onSelect, placeholder }: PlaceInputProps) {
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(value, 300);

  const query = useQuery({
    queryKey: ["geocode", "route", debounced],
    queryFn: ({ signal }) => searchLocations(debounced, signal),
    enabled: debounced.trim().length >= 2,
    staleTime: 30_000,
  });

  const suggestions = query.data ?? [];

  return (
    <div className="place-input">
      <label>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <ul className="place-input__suggestions">
          {suggestions.slice(0, 6).map((s) => (
            <li key={`${s.displayName}-${s.lat}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.displayName);
                  setOpen(false);
                  onSelect(s);
                }}
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
