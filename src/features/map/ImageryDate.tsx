import { useQuery } from "@tanstack/react-query";
import { useMapStore } from "@/stores/mapStore";
import { apiGet } from "@/services/apiClient";
import "./ImageryDate.css";

export interface ImageryData {
  captured: string;
  year: number;
  resolutionMeters: number | null;
  provider: string | null;
  product: string | null;
}

/**
 * The capture date of the satellite picture currently on screen.
 *
 * Users reported "old imagery is coming everywhere". They were right, and it
 * is not a fault in this app: the satellite basemap is a free Esri mosaic
 * where every area was photographed on its own date, so one city looks
 * current and the next town looks years old. Without a date on screen that is
 * indistinguishable from a broken feature.
 *
 * So this says the date out loud, from Esri's own published metadata for that
 * exact ground. It turns a silent, suspicious gap into a stated fact the
 * visitor can weigh — the same rule the population figure follows, and the
 * whole product with it.
 *
 * Shown only on the satellite basemap. On the street map there is no
 * photograph, so there is no capture date to report and a line about one
 * would be noise.
 */

/** "15 November 2025" reads better than 2025-11-15 in a single line of UI. */
function formatCaptured(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Whole months up to a year, then years — nobody needs "43 months ago". */
export function describeAge(iso: string, now: Date = new Date()): string | null {
  const captured = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(captured.getTime())) return null;
  const months = Math.floor((now.getTime() - captured.getTime()) / (30.44 * 86_400_000));
  if (months < 0) return null;
  if (months < 1) return "this month";
  if (months === 1) return "1 month old";
  if (months < 12) return `${months} months old`;
  const years = Math.floor(months / 12);
  return years === 1 ? "about 1 year old" : `about ${years} years old`;
}

export function ImageryDate() {
  const basemap = useMapStore((s) => s.basemap);
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);

  // Rounded so an ordinary pan doesn't make a new query key on every frame;
  // the endpoint caches at the same granularity.
  const lat = Number(center[1].toFixed(2));
  const lon = Number(center[0].toFixed(2));
  const z = Math.round(zoom);

  const query = useQuery({
    queryKey: ["imagery", lat, lon, z],
    queryFn: ({ signal }) => apiGet<{ imagery: ImageryData | null }>("/api/imagery", { lat, lon, zoom: z }, signal),
    enabled: basemap === "satellite",
    staleTime: 60 * 60 * 1000,
  });

  if (basemap !== "satellite") return null;

  if (query.isLoading) {
    return <p className="imagery-date imagery-date--muted">Checking when this imagery was taken…</p>;
  }

  const imagery = query.data?.imagery ?? null;

  if (!imagery) {
    // Saying nothing here would leave the visitor to assume the picture is
    // current, which is the exact assumption this component exists to stop.
    return (
      <p className="imagery-date imagery-date--muted">
        Esri does not publish a capture date for this area, so the age of this imagery is unknown.
      </p>
    );
  }

  const age = describeAge(imagery.captured);

  return (
    <p className="imagery-date">
      <span className="imagery-date__label">Imagery captured</span>
      <span className="imagery-date__value">
        {formatCaptured(imagery.captured)}
        {age ? <span className="imagery-date__age"> ({age})</span> : null}
      </span>
      <span className="imagery-date__meta">
        {[imagery.provider, imagery.resolutionMeters ? `${imagery.resolutionMeters} m per pixel` : null]
          .filter(Boolean)
          .join(" · ")}
        {imagery.provider || imagery.resolutionMeters ? " · " : ""}
        Source: Esri World Imagery
      </span>
    </p>
  );
}
